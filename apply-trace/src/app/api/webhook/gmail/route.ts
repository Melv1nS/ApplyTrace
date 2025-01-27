import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { JobStatus } from '@prisma/client'
import crypto from 'crypto'
import { checkAndRenewGmailWatch } from '@/app/utils/gmailWatch'
import { JOB_EMAIL_ANALYSIS_PROMPT } from '@/app/utils/geminiPrompts'

// Add interface for Gemini response
interface GeminiAnalysis {
  isJobRelated: boolean;
  type: 'APPLICATION' | 'REJECTION' | 'INTERVIEW_REQUEST' | 'OTHER';
  companyName: string;
  roleTitle: string;
  confidence: number;
}

interface GmailNotification {
  emailAddress: string;
  historyId: number;
}

// Add interface for Gmail API errors
interface GmailApiError {
  code: number;
  message: string;
  errors?: Array<{
    message: string;
    domain: string;
    reason: string;
  }>;
}

// Add interface for Gemini API errors
interface GeminiApiError {
  status: number;
  message: string;
  details?: unknown;
}

// Add new interface for Hugging Face API error
interface HuggingFaceApiError {
  error: string;
  status?: number;
}

// Create a Supabase client with the service role key
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

// Simple in-memory rate limiting
const rateLimiter = {
  lastCallTime: 0,
  minDelayMs: 1000, // Minimum 1 second between calls
  retryCount: 0,
  maxRetries: 3,
  getBackoffDelay() {
    return Math.min(1000 * Math.pow(2, this.retryCount), 10000); // Max 10 second delay
  },
  reset() {
    this.retryCount = 0;
  }
}

// Add webhook rate limiting
const webhookRateLimiter = {
  requests: new Map<string, { count: number, firstRequest: number }>(),
  maxRequests: 10,
  windowMs: 60000, // 1 minute
  isRateLimited(emailAddress: string): boolean {
    const now = Date.now()
    const userRequests = this.requests.get(emailAddress)

    if (!userRequests) {
      this.requests.set(emailAddress, { count: 1, firstRequest: now })
      return false
    }

    if (now - userRequests.firstRequest > this.windowMs) {
      // Reset window
      this.requests.set(emailAddress, { count: 1, firstRequest: now })
      return false
    }

    if (userRequests.count >= this.maxRequests) {
      return true
    }

    userRequests.count++
    return false
  }
}

async function refreshAccessToken(refreshToken: string, userEmail: string) {
  try {
    // Create a new OAuth2 client for each refresh to avoid state conflicts
    const refreshClient = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`
    )

    refreshClient.setCredentials({
      refresh_token: refreshToken
    })

    const response = await refreshClient.refreshAccessToken()
    const accessToken = response.credentials.access_token

    if (!accessToken) {
      throw new Error('No access token in refresh response')
    }

    // Check if refresh token was also returned and update it
    if (response.credentials.refresh_token) {
      // Update both tokens in the database
      const { error: updateError } = await supabaseAdmin
        .from('email_sessions')
        .update({
          access_token: accessToken,
          refresh_token: response.credentials.refresh_token,
          updated_at: new Date().toISOString()
        })
        .eq('email', userEmail)

      if (updateError) {
        console.error('Failed to update tokens:', updateError)
        throw new Error('Failed to update tokens in database')
      }
    }

    return accessToken
  } catch (error: unknown) {
    console.error('Error refreshing access token:', error)

    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase()
      // Check for various OAuth2 error conditions
      if (
        errorMessage.includes('invalid_grant') ||
        errorMessage.includes('invalid_request') ||
        errorMessage.includes('invalid_client')
      ) {
        console.log('OAuth2 error detected, removing invalid session')
        // Remove invalid session
        await supabaseAdmin
          .from('email_sessions')
          .delete()
          .eq('email', userEmail)

        throw new Error('Invalid OAuth2 credentials - session removed')
      }
    }

    throw error
  }
}

async function analyzeWithDeepseek(subject: string, emailBody: string): Promise<GeminiAnalysis> {
  try {
    // Rate limiting with exponential backoff
    const now = Date.now();
    const timeSinceLastCall = now - rateLimiter.lastCallTime;
    const backoffDelay = rateLimiter.getBackoffDelay();
    const waitTime = Math.max(backoffDelay - timeSinceLastCall, 0);

    if (waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    rateLimiter.lastCallTime = Date.now();

    const response = await fetch(
      "https://api-inference.huggingface.co/models/deepseek-ai/deepseek-ai/DeepSeek-R1-Distill-Llama-8B",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: JOB_EMAIL_ANALYSIS_PROMPT
            .replace('${subject}', subject)
            .replace('${emailBody}', emailBody),
          parameters: {
            max_new_tokens: 1024,
            temperature: 0.1,
            top_p: 0.95,
            return_full_text: false,
            do_sample: true
          }
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Hugging Face API error: ${error.error || 'Unknown error'}`);
    }

    const result = await response.json();

    // The API returns an array of generated texts
    const generatedText = Array.isArray(result) ? result[0].generated_text : result.generated_text;

    // Remove any markdown code block formatting if present
    const jsonStr = generatedText.replace(/^```json\n|\n```$/g, '').trim();

    try {
      return JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse Deepseek response:', parseError);
      // Return a default analysis for parsing errors
      return {
        isJobRelated: false,
        type: 'OTHER',
        companyName: 'Unknown',
        roleTitle: 'Unknown',
        confidence: 0
      };
    }

    // Reset retry count on success
    rateLimiter.reset();
  } catch (error: unknown) {
    const hfError = error as HuggingFaceApiError;
    if (hfError?.status === 429 && rateLimiter.retryCount < rateLimiter.maxRetries) {
      rateLimiter.retryCount++;
      console.log(`Rate limited, attempt ${rateLimiter.retryCount}/${rateLimiter.maxRetries}. Retrying in ${rateLimiter.getBackoffDelay()}ms`);
      return analyzeWithDeepseek(subject, emailBody);
    }

    console.error('Failed to analyze with Deepseek:', error);
    // Return a default analysis for errors
    return {
      isJobRelated: false,
      type: 'OTHER',
      companyName: 'Unknown',
      roleTitle: 'Unknown',
      confidence: 0
    };
  }
}

export async function POST(request: Request) {
  try {
    const requestBody = await request.json()
    console.log('Received webhook payload:', JSON.stringify(requestBody))

    const message = requestBody.message
    if (!message?.data) {
      console.error('Invalid Pub/Sub message format')
      return NextResponse.json({ error: 'Invalid message format' }, { status: 400 })
    }

    const decodedData = Buffer.from(message.data, 'base64').toString()
    console.log('Decoded message data:', decodedData)

    if (decodedData === 'test') {
      console.log('Received test message, acknowledging')
      return NextResponse.json({ success: true })
    }

    let data: GmailNotification
    try {
      data = JSON.parse(decodedData)
    } catch (error) {
      console.error('Failed to parse message data:', error)
      return NextResponse.json({ error: 'Invalid message data' }, { status: 400 })
    }

    // Apply rate limiting
    if (webhookRateLimiter.isRateLimited(data.emailAddress)) {
      console.log(`Rate limit exceeded for ${data.emailAddress}`)
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    console.log('Parsed notification data:', data)

    // Gmail notifications contain emailAddress and historyId
    const emailAddress = data.emailAddress
    const historyId = data.historyId

    if (!emailAddress || !historyId) {
      console.error('Missing required Gmail data:', { emailAddress, historyId, data })
      return NextResponse.json({ error: 'Missing required Gmail data' }, { status: 400 })
    }

    // Get user session from email metadata using email address
    console.log('Looking up session for email:', emailAddress)

    const { data: session, error: findError } = await supabaseAdmin
      .from('email_sessions')
      .select('*')
      .eq('email', emailAddress.toLowerCase())
      .single();

    if (findError) {
      // Handle the specific "no rows" error case
      if (findError.code === 'PGRST116') {
        console.log(`No session found for email ${emailAddress}. User needs to sign in again.`);
        return NextResponse.json({
          success: false,
          error: 'No session found for this email. Please sign in through Google to create a session.'
        }, { status: 404 });
      }

      // Handle other errors
      console.error('Error fetching user session:', findError);
      return NextResponse.json({ success: false, error: findError }, { status: 500 });
    }

    if (!session) {
      console.log('No session data returned even though query succeeded');
      return NextResponse.json({
        success: false,
        error: 'Session not found'
      }, { status: 404 });
    }

    // Skip if we've already processed this history ID
    if (session.last_history_id && parseInt(session.last_history_id) >= historyId) {
      console.log('Skipping already processed history ID:', historyId)
      return NextResponse.json({ success: true })
    }

    console.log('Found user session:', {
      userId: session.user_id,
      hasAccessToken: !!session.access_token,
      email: session.email
    })

    // Initialize Gmail API client
    const authClient = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`
    )

    // Set initial credentials
    authClient.setCredentials({
      access_token: session.access_token,
      refresh_token: session.refresh_token
    })

    const gmail = google.gmail({
      version: 'v1',
      auth: authClient
    })

    // Update token refresh handling
    async function ensureValidAccessToken() {
      try {
        await gmail.users.getProfile({ userId: 'me' })
      } catch (error: unknown) {
        if (error instanceof Error) {
          const isGmailError = 'code' in error
          const errorCode = isGmailError ? (error as GmailApiError).code : null
          const errorMessage = error.message.toLowerCase()

          if (
            errorCode === 401 ||
            errorMessage.includes('invalid_grant') ||
            errorMessage.includes('invalid_request') ||
            errorMessage.includes('invalid_client')
          ) {
            console.log('Access token expired or invalid, refreshing...')
            try {
              const newAccessToken = await refreshAccessToken(session.refresh_token, data.emailAddress)

              // Update oauth client with new token
              authClient.setCredentials({
                access_token: newAccessToken,
                refresh_token: session.refresh_token
              })
            } catch (refreshError) {
              if (refreshError instanceof Error &&
                (refreshError.message?.includes('session removed') ||
                  refreshError.message?.includes('invalid_grant'))) {
                return NextResponse.json({
                  error: 'Session invalid and removed. Please re-authenticate.'
                }, { status: 401 })
              }
              throw refreshError
            }
          } else {
            throw error
          }
        } else {
          throw error
        }
      }
    }

    // Ensure valid access token before fetching Gmail history
    await ensureValidAccessToken()

    // Fetch Gmail history
    console.log('Fetching Gmail history...')
    const { data: history } = await gmail.users.history.list({
      userId: 'me',
      startHistoryId: historyId.toString()
    })

    console.log('Gmail history response:', {
      hasHistory: !!history,
      historyLength: history?.history?.length || 0,
      historyDetails: history?.history?.map(h => ({
        messages: h.messages?.length || 0,
        messagesAdded: h.messagesAdded?.length || 0,
        labelsAdded: h.labelsAdded?.length || 0,
        labelsRemoved: h.labelsRemoved?.length || 0
      }))
    })

    // Process all messages in the history
    const messageIds = new Set<string>()

    // Add messages from history if any
    if (history?.history?.length) {
      history.history.forEach(historyEntry => {
        // From messages
        historyEntry.messages?.forEach(msg => {
          if (msg.id) messageIds.add(msg.id)
        })
        // From messagesAdded
        historyEntry.messagesAdded?.forEach(added => {
          if (added.message?.id) messageIds.add(added.message.id)
        })
      })
    }

    // If no messages found in history, list recent messages
    if (messageIds.size === 0) {
      console.log('No messages in history, checking recent messages...')
      const { data: messages } = await gmail.users.messages.list({
        userId: 'me',
        maxResults: 1,  // Just get the most recent message
        labelIds: ['INBOX']  // Only get messages from inbox
      })

      if (messages?.messages?.[0]?.id) {
        const messageId = messages.messages[0].id
        const { data: messageDetails } = await gmail.users.messages.get({
          userId: 'me',
          id: messageId,
          format: 'metadata',
          metadataHeaders: ['subject', 'from', 'to', 'date']
        })

        if (messageDetails?.internalDate) {
          // Check if message is recent (within last hour)
          const messageDate = new Date(parseInt(messageDetails.internalDate))
          const isRecent = (Date.now() - messageDate.getTime()) < 60 * 60 * 1000 // 1 hour in milliseconds

          if (isRecent) {
            console.log('Found recent message:', messageId)
            messageIds.add(messageId)
          } else {
            console.log('Most recent message is too old:', {
              messageId: messageId,
              date: messageDate
            })
          }
        }
      }
    }

    console.log('Found message IDs:', Array.from(messageIds))

    if (messageIds.size === 0) {
      console.log('No messages found to process')
      return NextResponse.json({ success: true })
    }

    // Process each unique message
    const messagePromises = Array.from(messageIds).map(async (messageId) => {
      console.log('Processing message:', messageId)

      try {
        // Check if the message has already been processed and not deleted
        const { data: existingJob } = await supabaseAdmin
          .from('job_applications')
          .select('id, is_deleted')
          .eq('email_id', messageId)
          .single()

        if (existingJob) {
          if (existingJob.is_deleted) {
            console.log('Skipping deleted application:', messageId)
            return
          }
          console.log('Skipping already processed message:', messageId)
          return
        }

        // Get message details
        console.log('Fetching message details for:', messageId)
        let messageDetails
        try {
          const { data: fullMessage } = await gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'full',
            metadataHeaders: ['subject', 'from', 'to']
          })
          messageDetails = fullMessage
        } catch (error) {
          const gmailError = error as GmailApiError
          if (gmailError.code === 404) {
            console.log('Message no longer exists:', messageId)
            return
          }
          throw error
        }

        // Extract email content
        const headers = messageDetails.payload?.headers || []
        const subject = headers.find(h => h?.name?.toLowerCase() === 'subject')?.value || ''
        const from = headers.find(h => h?.name?.toLowerCase() === 'from')?.value || ''
        const to = headers.find(h => h?.name?.toLowerCase() === 'to')?.value || ''
        const date = headers.find(h => h?.name?.toLowerCase() === 'date')?.value

        // Get email timestamp from headers first (more accurate for sent time), fallback to internalDate
        let emailTimestamp: string
        if (date) {
          // Parse the email header date which includes timezone information
          emailTimestamp = new Date(date).toISOString()
        } else if (messageDetails.internalDate) {
          // Fallback to internalDate (UTC milliseconds)
          emailTimestamp = new Date(parseInt(messageDetails.internalDate)).toISOString()
        } else {
          // Last resort fallback
          emailTimestamp = new Date().toISOString()
        }

        // Get full message body
        let messageBody = ''
        if (messageDetails.payload?.body?.data) {
          // Decode base64 body
          messageBody = Buffer.from(messageDetails.payload.body.data, 'base64').toString()
        } else if (messageDetails.payload?.parts) {
          // Handle multipart messages
          for (const part of messageDetails.payload.parts) {
            if (part.mimeType === 'text/plain' && part.body?.data) {
              messageBody += Buffer.from(part.body.data, 'base64').toString()
            }
          }
        }

        // Fallback to snippet if body extraction fails
        if (!messageBody) {
          console.log('Failed to extract full body, falling back to snippet')
          messageBody = messageDetails.snippet || ''
        }

        console.log('Processing email:', {
          subject,
          messageId,
          from,
          to,
          bodyLength: messageBody.length  // Log the length of the body for debugging
        })
        const analysis = await analyzeWithDeepseek(subject, messageBody)
        console.log('Analysis result:', analysis)

        if (analysis.isJobRelated && analysis.confidence > 0.7) {
          console.log('Processing job-related email:', {
            companyName: analysis.companyName,
            roleTitle: analysis.roleTitle,
            status: analysis.type
          })

          // First check for existing application from this company
          if (analysis.type === 'REJECTION') {
            // Search for existing application from this company (including rejected ones)
            const { data: existingApplications } = await supabaseAdmin
              .from('job_applications')
              .select('*')
              .eq('user_id', session.user_id)
              .ilike('company_name', analysis.companyName)  // Case-insensitive company match
              .order('created_at', { ascending: false })  // Get most recent first
              .limit(1)

            if (existingApplications && existingApplications.length > 0) {
              // Only update if the application isn't already rejected
              if (existingApplications[0].status !== JobStatus.REJECTED) {
                // Update existing application
                const { error: updateError } = await supabaseAdmin
                  .from('job_applications')
                  .update({
                    status: JobStatus.REJECTED,
                    updated_at: new Date().toISOString(),
                    rejection_email_id: messageId
                  })
                  .eq('id', existingApplications[0].id)

                if (updateError) {
                  console.error('Error updating job application status:', updateError)
                } else {
                  console.log('Successfully updated job application status to rejected')
                }
              } else {
                console.log('Application already rejected, skipping update')
              }
            } else {
              // Create new rejected application ONLY if no application exists for this company
              const { error: insertError } = await supabaseAdmin.from('job_applications').insert({
                id: crypto.randomUUID(),
                user_id: session.user_id,
                company_name: analysis.companyName,
                role_title: analysis.roleTitle,
                status: JobStatus.REJECTED,
                applied_date: emailTimestamp,
                updated_at: new Date().toISOString(),
                email_id: messageId,
                rejection_email_id: messageId
              })

              if (insertError) {
                console.error('Error creating rejected job application:', insertError)
              } else {
                console.log('Successfully created new rejected application')
              }
            }
          } else if (analysis.type === 'INTERVIEW_REQUEST') {
            // For interview requests, also check role title case-insensitively
            const { data: existingApplicationsWithRole } = await supabaseAdmin
              .from('job_applications')
              .select('*')
              .eq('user_id', session.user_id)
              .eq('is_deleted', false)  // Only check non-deleted applications
              .ilike('company_name', analysis.companyName)
              .ilike('role_title', analysis.roleTitle)
              .order('created_at', { ascending: false })
              .limit(1)

            if (existingApplicationsWithRole?.[0]?.id) {
              // Update existing application to reflect interview request
              const { error: updateError } = await supabaseAdmin
                .from('job_applications')
                .update({
                  status: JobStatus.INTERVIEW_SCHEDULED,
                  updated_at: new Date().toISOString(),
                  interview_request_email_id: messageId
                })
                .eq('id', existingApplicationsWithRole[0].id)

              if (updateError) {
                console.error('Error updating job application status for interview:', updateError)
              } else {
                console.log('Successfully updated job application status to interviewing')
              }
            } else {
              // Create new application with INTERVIEW_SCHEDULED status if none exists
              const { error: insertError } = await supabaseAdmin.from('job_applications').insert({
                id: crypto.randomUUID(),
                user_id: session.user_id,
                company_name: analysis.companyName,
                role_title: analysis.roleTitle,
                status: JobStatus.INTERVIEW_SCHEDULED,
                applied_date: emailTimestamp,
                updated_at: new Date().toISOString(),
                email_id: messageId,
                interview_request_email_id: messageId
              })

              if (insertError) {
                console.error('Error creating new job application for interview:', insertError)
              } else {
                console.log('Successfully created new job application with interview status')
              }
            }
          } else if (analysis.type === 'APPLICATION') {
            // For new applications, check if a similar one exists case-insensitively
            const { data: existingApplicationsWithRole } = await supabaseAdmin
              .from('job_applications')
              .select('*')
              .eq('user_id', session.user_id)
              .eq('is_deleted', false)  // Only check non-deleted applications
              .ilike('company_name', analysis.companyName)
              .ilike('role_title', analysis.roleTitle)
              .order('created_at', { ascending: false })
              .limit(1)

            if (!existingApplicationsWithRole?.[0]) {
              const { error: insertError } = await supabaseAdmin.from('job_applications').insert({
                id: crypto.randomUUID(),
                user_id: session.user_id,
                company_name: analysis.companyName,
                role_title: analysis.roleTitle,
                status: JobStatus.APPLIED,
                applied_date: emailTimestamp,
                updated_at: new Date().toISOString(),
                email_id: messageId
              })

              if (insertError) {
                console.error('Error creating job application:', insertError)
              } else {
                console.log('Successfully created job application')
              }
            } else {
              console.log('Similar application already exists, skipping creation')
            }
          } else {
            console.log('Skipping email processing - no action needed')
          }
        } else {
          console.log('Email not job-related or low confidence:', {
            isJobRelated: analysis.isJobRelated,
            confidence: analysis.confidence
          })
        }
      } catch (error) {
        console.error('Error processing message:', messageId, error)
      }
    })

    console.log('Processing', messagePromises.length, 'messages')
    await Promise.all(messagePromises.filter(Boolean))
    console.log('Finished processing all messages')

    // Update the last processed history ID
    await supabaseAdmin
      .from('email_sessions')
      .update({ last_history_id: historyId.toString() })
      .eq('user_id', session.user_id)

    // After processing messages, check and renew Gmail watch if needed
    console.log('Checking Gmail watch status...')
    const watchResponse = await checkAndRenewGmailWatch(session.access_token, session.user_id)
    if (!watchResponse.success) {
      console.error('Failed to renew Gmail watch:', watchResponse.error)
    } else {
      console.log('Gmail watch status checked/renewed successfully')
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error processing webhook:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
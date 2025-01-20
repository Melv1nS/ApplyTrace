import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { JobStatus } from '@prisma/client'
import { GoogleGenerativeAI } from '@google/generative-ai'

// Add interface for Gemini response
interface GeminiAnalysis {
  isJobRelated: boolean;
  type: 'APPLICATION' | 'REJECTION' | 'OTHER';
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
}

async function analyzeWithGemini(subject: string, emailBody: string): Promise<GeminiAnalysis> {
  // Rate limiting
  const now = Date.now()
  const timeSinceLastCall = now - rateLimiter.lastCallTime
  if (timeSinceLastCall < rateLimiter.minDelayMs) {
    await new Promise(resolve => setTimeout(resolve, rateLimiter.minDelayMs - timeSinceLastCall))
  }
  rateLimiter.lastCallTime = Date.now()

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

    const prompt = `Analyze this email for job application related content. Subject: "${subject}" Body: "${emailBody}"
      Return a JSON object (without any markdown formatting or code blocks) with the following fields:
      - isJobRelated (boolean): is this email related to a job application?
      - type: either "APPLICATION", "REJECTION", or "OTHER"
      - companyName: the company name if found, or "Unknown"
      - roleTitle: the job title if found, or "Unknown"
      - confidence: number between 0 and 1 indicating confidence in this analysis
      
      Focus on identifying application confirmations and rejection notices.
      
      IMPORTANT: Return ONLY the raw JSON object, no markdown formatting, no code blocks, no backticks.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();

    // Remove any markdown code block formatting if present
    const jsonStr = text.replace(/^```json\n|\n```$/g, '').trim();

    return JSON.parse(jsonStr);
  } catch (error) {
    console.error('Failed to analyze with Gemini:', error);
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

    // Log the incoming payload for debugging
    console.log('Received webhook payload:', JSON.stringify(requestBody))

    // Handle Pub/Sub push notification format
    const message = requestBody.message
    if (!message?.data) {
      console.error('Invalid Pub/Sub message format')
      return NextResponse.json({ error: 'Invalid message format' }, { status: 400 })
    }

    // Pub/Sub messages come base64 encoded
    const decodedData = Buffer.from(message.data, 'base64').toString()
    console.log('Decoded message data:', decodedData)

    // Handle Gmail push notification format
    // The message might be a test message from topic setup
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
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({
      access_token: session.access_token
    })

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    // Get history list to find the new message
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
        // Skip if we've already processed this message
        const { data: existingJob } = await supabaseAdmin
          .from('job_applications')
          .select('id')
          .eq('email_id', messageId)
          .single()

        if (existingJob) {
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
        const analysis = await analyzeWithGemini(subject, messageBody)
        console.log('Analysis result:', analysis)

        if (analysis.isJobRelated && analysis.confidence > 0.7) {
          console.log('Creating new job application:', {
            companyName: analysis.companyName,
            roleTitle: analysis.roleTitle,
            status: analysis.type
          })

          // Create new job application
          const { error: insertError } = await supabaseAdmin.from('job_applications').insert({
            user_id: session.user_id,
            company_name: analysis.companyName,
            role_title: analysis.roleTitle,
            status: analysis.type === 'REJECTION' ? JobStatus.REJECTED : JobStatus.APPLIED,
            applied_date: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            email_id: messageId
          })

          if (insertError) {
            console.error('Error creating job application:', insertError)
          } else {
            console.log('Successfully created job application')
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

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error processing webhook:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
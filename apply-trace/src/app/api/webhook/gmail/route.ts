import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { gmail_v1 } from 'googleapis'
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

async function analyzeWithGemini(subject: string, emailBody: string): Promise<GeminiAnalysis> {
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

  try {
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error('Failed to parse Gemini response:', { text, jsonStr, error });
    // Return a default analysis for non-job related emails
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

    const { data: userSession, error: sessionError } = await supabaseAdmin
      .from('email_sessions')
      .select('user_id, access_token, email')
      .eq('email', emailAddress)
      .single()

    if (sessionError) {
      console.error('Error fetching user session:', sessionError)
      return NextResponse.json({ error: 'Error fetching user session' }, { status: 500 })
    }

    if (!userSession) {
      // Double check if the session exists with a case-insensitive search
      const { data: allSessions } = await supabaseAdmin
        .from('email_sessions')
        .select('user_id, access_token, email')

      console.log('All available sessions:', allSessions)

      console.error('No user session found for email:', emailAddress)
      return NextResponse.json({ error: 'User session not found' }, { status: 404 })
    }

    console.log('Found user session:', {
      userId: userSession.user_id,
      hasAccessToken: !!userSession.access_token,
      email: userSession.email
    })

    // Initialize Gmail API client
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({
      access_token: userSession.access_token
    })

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    // Get history list to find the new message
    const { data: history } = await gmail.users.history.list({
      userId: 'me',
      startHistoryId: historyId.toString(),
      historyTypes: ['messageAdded']
    })

    // Process each new message in the history
    const messagePromises = history.history?.[0]?.messagesAdded?.map(async (added: gmail_v1.Schema$HistoryMessageAdded) => {
      const messageId = added.message?.id
      if (!messageId) return

      // Get full message details
      const { data: fullMessage } = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'metadata',
        metadataHeaders: ['subject', 'from', 'to']
      })

      // Extract email content
      const headers = fullMessage.payload?.headers || []
      const subject = headers.find(h => h?.name?.toLowerCase() === 'subject')?.value || ''
      const from = headers.find(h => h?.name?.toLowerCase() === 'from')?.value || ''
      const to = headers.find(h => h?.name?.toLowerCase() === 'to')?.value || ''

      // Use snippet instead of full body
      const messageBody = fullMessage.snippet || ''

      console.log('Processing email:', { subject, messageId, from, to })
      const analysis = await analyzeWithGemini(subject, messageBody)
      console.log('Analysis result:', analysis)

      if (analysis.isJobRelated && analysis.confidence > 0.7) {
        // Check if we already have this email processed
        const { data: existingJob } = await supabaseAdmin
          .from('job_applications')
          .select('id')
          .eq('email_id', messageId)
          .single()

        if (!existingJob) {
          console.log('Creating new job application:', {
            companyName: analysis.companyName,
            roleTitle: analysis.roleTitle,
            status: analysis.type
          })

          // Create new job application
          await supabaseAdmin.from('job_applications').insert({
            userId: userSession.user_id,
            companyName: analysis.companyName,
            roleTitle: analysis.roleTitle,
            status: analysis.type === 'REJECTION' ? JobStatus.REJECTED : JobStatus.APPLIED,
            appliedDate: new Date().toISOString(),
            emailId: messageId
          })
        } else {
          console.log('Job application already exists for email:', messageId)
        }
      } else {
        console.log('Email not job-related or low confidence:', {
          isJobRelated: analysis.isJobRelated,
          confidence: analysis.confidence
        })
      }
    })

    if (messagePromises) {
      await Promise.all(messagePromises)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error processing webhook:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
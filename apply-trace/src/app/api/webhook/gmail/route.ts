import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
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

async function analyzeWithGemini(subject: string, emailBody: string): Promise<GeminiAnalysis> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

  const prompt = `Analyze this email for job application related content. Subject: "${subject}" Body: "${emailBody}"
    Return a JSON object with the following fields:
    - isJobRelated (boolean): is this email related to a job application?
    - type: either "APPLICATION", "REJECTION", or "OTHER"
    - companyName: the company name if found, or "Unknown"
    - roleTitle: the job title if found, or "Unknown"
    - confidence: number between 0 and 1 indicating confidence in this analysis
    
    Focus on identifying application confirmations and rejection notices.`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  return JSON.parse(response.text());
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

    let data: any
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
    const supabase = createRouteHandlerClient({ cookies })
    const { data: userSession } = await supabase
      .from('email_sessions')
      .select('user_id, access_token')
      .eq('email', emailAddress)  // We'll need to add this column to the email_sessions table
      .single()

    if (!userSession) {
      console.error('No user session found for email:', emailAddress)
      return NextResponse.json({ error: 'User session not found' }, { status: 404 })
    }

    // Initialize Gmail API client
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({
      access_token: userSession.access_token
    })

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    // Get history list to find the new message
    const { data: history } = await gmail.users.history.list({
      userId: 'me',
      startHistoryId: historyId,
      historyTypes: ['messageAdded']
    })

    // Process each new message in the history
    const messagePromises = history.history?.[0]?.messagesAdded?.map(async (added) => {
      const messageId = added.message?.id
      if (!messageId) return

      // Get full message details
      const { data: fullMessage } = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
      })

      // Extract email content
      const headers = fullMessage.payload?.headers || []
      const subject = headers.find(h => h?.name?.toLowerCase() === 'subject')?.value || ''
      const messageBody = fullMessage.payload?.parts?.[0]?.body?.data || ''
      const decodedBody = Buffer.from(messageBody, 'base64').toString('utf-8')

      console.log('Processing email:', { subject, messageId })
      const analysis = await analyzeWithGemini(subject, decodedBody)
      console.log('Analysis result:', analysis)

      if (analysis.isJobRelated && analysis.confidence > 0.7) {
        // Check if we already have this email processed
        const { data: existingJob } = await supabase
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
          await supabase.from('job_applications').insert({
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
    }) || []

    // Wait for all messages to be processed
    await Promise.all(messagePromises)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
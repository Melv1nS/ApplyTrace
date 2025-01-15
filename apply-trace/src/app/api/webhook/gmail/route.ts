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

async function analyzeWithGemini(subject: string, body: string): Promise<GeminiAnalysis> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

  const prompt = `Analyze this email for job application related content. Subject: "${subject}" Body: "${body}"
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

// Function to extract job application details from email
async function extractJobDetails(message: any) {
  const subject = message.payload.headers.find(
    (header: any) => header.name.toLowerCase() === 'subject'
  )?.value || '';

  const body = message.payload.parts?.[0]?.body?.data || '';
  const decodedBody = Buffer.from(body, 'base64').toString('utf-8');

  const analysis = await analyzeWithGemini(subject, decodedBody);

  if (!analysis.isJobRelated || analysis.confidence < 0.7) {
    return null;
  }

  return {
    companyName: analysis.companyName,
    roleTitle: analysis.roleTitle,
    status: analysis.type === 'REJECTION' ? JobStatus.REJECTED : JobStatus.APPLIED,
    emailId: message.id,
    confidence: analysis.confidence
  };
}

export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const payload = await request.json()
    const { message } = payload

    // Initialize Gmail API client
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({
      access_token: session.provider_token
    })

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    // Get full message details
    const { data: fullMessage } = await gmail.users.messages.get({
      userId: 'me',
      id: message.data.emailId,
      format: 'full'
    })

    const jobDetails = await extractJobDetails(fullMessage)

    if (jobDetails) {
      // Check if we already have this email processed
      const { data: existingJob } = await supabase
        .from('job_applications')
        .select('id')
        .eq('email_id', jobDetails.emailId)
        .single()

      if (!existingJob) {
        // Create new job application
        await supabase.from('job_applications').insert({
          userId: session.user.id,
          companyName: jobDetails.companyName,
          roleTitle: jobDetails.roleTitle,
          status: jobDetails.status,
          appliedDate: new Date().toISOString(),
          emailId: jobDetails.emailId
        })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
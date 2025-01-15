import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { JobStatus } from '@prisma/client'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { Buffer } from 'buffer'

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
        const { emailId } = requestBody.message.data

        // Get user session from email metadata
        const supabase = createRouteHandlerClient({ cookies })
        const { data: userSession } = await supabase
            .from('email_sessions')
            .select('user_id, access_token')
            .eq('email_id', emailId)
            .single()

        if (!userSession) {
            return NextResponse.json({ error: 'User session not found' }, { status: 404 })
        }

        // Initialize Gmail API client
        const oauth2Client = new google.auth.OAuth2()
        oauth2Client.setCredentials({
            access_token: userSession.access_token
        })

        const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

        // Get full message details
        const { data: fullMessage } = await gmail.users.messages.get({
            userId: 'me',
            id: emailId,
            format: 'full'
        })

        // Extract email content
        const headers = fullMessage.payload?.headers || []
        const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || ''
        const messageBody = fullMessage.payload?.parts?.[0]?.body?.data || ''
        const decodedBody = Buffer.from(messageBody, 'base64').toString('utf-8')

        const analysis = await analyzeWithGemini(subject, decodedBody)

        if (analysis.isJobRelated && analysis.confidence > 0.7) {
            // Check if we already have this email processed
            const { data: existingJob } = await supabase
                .from('job_applications')
                .select('id')
                .eq('email_id', emailId)
                .single()

            if (!existingJob) {
                // Create new job application
                await supabase.from('job_applications').insert({
                    userId: userSession.user_id,
                    companyName: analysis.companyName,
                    roleTitle: analysis.roleTitle,
                    status: analysis.type === 'REJECTION' ? JobStatus.REJECTED : JobStatus.APPLIED,
                    appliedDate: new Date().toISOString(),
                    emailId: emailId
                })
            }
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Webhook error:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}

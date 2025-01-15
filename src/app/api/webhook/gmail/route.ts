import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { analyzeEmail } from '@/app/utils/emailAnalyzer'
import { EmailContent } from '@/app/types/job'

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

        // Extract email content
        const headers = fullMessage.payload?.headers || []
        const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || ''
        const from = headers.find(h => h.name.toLowerCase() === 'from')?.value || ''
        const to = headers.find(h => h.name.toLowerCase() === 'to')?.value || ''
        const date = headers.find(h => h.name.toLowerCase() === 'date')?.value || ''

        // Get email body
        const body = fullMessage.payload?.parts?.[0]?.body?.data || ''
        const decodedBody = Buffer.from(body, 'base64').toString('utf-8')

        // Analyze email with Gemini
        const emailContent: EmailContent = {
            subject,
            body: decodedBody,
            from,
            to,
            date
        }

        const analysis = await analyzeEmail(emailContent)

        // Only process if it's job related and we're confident (>0.7)
        if (analysis.isJobRelated && analysis.confidence > 0.7) {
            // Check if we already have this email processed
            const { data: existingJob } = await supabase
                .from('job_applications')
                .select('id')
                .eq('email_id', fullMessage.id)
                .single()

            if (!existingJob) {
                // Create new job application with enhanced details
                await supabase.from('job_applications').insert({
                    userId: session.user.id,
                    companyName: analysis.companyName,
                    roleTitle: analysis.roleTitle,
                    status: analysis.status,
                    appliedDate: new Date().toISOString(),
                    emailId: fullMessage.id,
                    nextSteps: analysis.nextSteps,
                    interviewDate: analysis.interviewDate,
                    location: analysis.location,
                    salary: analysis.salary
                })
            }
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Webhook error:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
} 
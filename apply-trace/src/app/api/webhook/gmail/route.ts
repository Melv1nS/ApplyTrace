import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { JobStatus } from '@prisma/client'

// Function to extract job application details from email
async function extractJobDetails(message: any) {
  // Get the email subject and body
  const subject = message.payload.headers.find(
    (header: any) => header.name.toLowerCase() === 'subject'
  )?.value || ''
  
  const body = message.payload.parts?.[0]?.body?.data || ''
  const decodedBody = Buffer.from(body, 'base64').toString('utf-8')

  // Simple regex patterns to identify job-related emails
  const applicationPatterns = [
    /thank.*application/i,
    /application.*received/i,
    /applied.*position/i
  ]

  const rejectionPatterns = [
    /regret.*inform/i,
    /not.*moving forward/i,
    /position.*filled/i,
    /other candidates/i
  ]

  // Check if this is a job-related email
  const isApplication = applicationPatterns.some(pattern => 
    pattern.test(subject) || pattern.test(decodedBody)
  )
  
  const isRejection = rejectionPatterns.some(pattern => 
    pattern.test(subject) || pattern.test(decodedBody)
  )

  if (!isApplication && !isRejection) {
    return null
  }

  // Extract company name (simple heuristic - can be improved)
  const companyMatch = subject.match(/from\s+([^|]+)/) || decodedBody.match(/from\s+([^|]+)/)
  const companyName = companyMatch ? companyMatch[1].trim() : 'Unknown Company'

  // Extract role title (simple heuristic - can be improved)
  const roleMatch = subject.match(/for\s+([^|]+)/) || decodedBody.match(/for\s+([^|]+)/)
  const roleTitle = roleMatch ? roleMatch[1].trim() : 'Unknown Position'

  return {
    companyName,
    roleTitle,
    status: isRejection ? JobStatus.REJECTED : JobStatus.APPLIED,
    emailId: message.id
  }
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
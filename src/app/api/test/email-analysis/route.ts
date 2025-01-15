import { NextResponse } from 'next/server'
import { analyzeEmail } from '@/app/utils/emailAnalyzer'
import { EmailContent } from '@/app/types/job'

export async function POST(request: Request) {
    try {
        const emailContent: EmailContent = await request.json()

        // Validate required fields
        if (!emailContent.subject || !emailContent.body) {
            return NextResponse.json(
                { error: 'Missing required fields: subject and body are required' },
                { status: 400 }
            )
        }

        const analysis = await analyzeEmail(emailContent)
        return NextResponse.json({ analysis })
    } catch (error) {
        console.error('Test endpoint error:', error)
        return NextResponse.json(
            { error: 'Failed to analyze email' },
            { status: 500 }
        )
    }
} 
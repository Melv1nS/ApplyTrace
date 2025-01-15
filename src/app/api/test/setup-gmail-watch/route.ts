import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { setupGmailWatch } from '@/app/utils/gmailWatch'

export async function POST(request: Request) {
    try {
        const supabase = createRouteHandlerClient({ cookies })
        const { data: { session } } = await supabase.auth.getSession()

        if (!session) {
            return new NextResponse('Unauthorized', { status: 401 })
        }

        const success = await setupGmailWatch(session.provider_token!)

        if (success) {
            return NextResponse.json({
                message: 'Gmail notifications set up successfully. Send yourself a test email to trigger the webhook.',
                topicName: process.env.GMAIL_TOPIC_NAME
            })
        } else {
            return NextResponse.json({
                error: 'Failed to set up Gmail notifications'
            }, { status: 500 })
        }
    } catch (error) {
        console.error('Setup error:', error)
        return NextResponse.json({
            error: 'Internal Server Error'
        }, { status: 500 })
    }
} 
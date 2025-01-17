import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
    try {
        const supabase = createRouteHandlerClient({ cookies })

        // Get all sessions
        const { data: sessions, error } = await supabase
            .from('email_sessions')
            .select('*')

        if (error) {
            console.error('Error fetching sessions:', error)
            return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
        }

        // Log sessions for debugging
        console.log('Current email sessions:', sessions)

        return NextResponse.json({
            sessions,
            message: 'After checking sessions, please delete this debug route'
        })
    } catch (error) {
        console.error('Debug route error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
} 
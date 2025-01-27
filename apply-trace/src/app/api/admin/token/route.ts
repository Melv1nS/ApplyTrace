import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
    try {
        const supabase = createRouteHandlerClient({ cookies })

        // Get the current user's session
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Get the token from email_sessions
        const { data: emailSession } = await supabase
            .from('email_sessions')
            .select('access_token')
            .eq('user_id', session.user.id)
            .single()

        if (!emailSession) {
            return NextResponse.json({ error: 'No token found' }, { status: 404 })
        }

        return NextResponse.json({ token: emailSession.access_token })
    } catch (error) {
        console.error('Error retrieving token:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
} 
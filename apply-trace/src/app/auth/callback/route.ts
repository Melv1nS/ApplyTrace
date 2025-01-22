import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { setupGmailWatch } from '@/app/utils/gmailWatch'
import { google } from 'googleapis'

// Create a Supabase client with the service role key for admin operations
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

async function getUserEmail(providerToken: string): Promise<string> {
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({
        access_token: providerToken
    })

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
    const { data: profile } = await gmail.users.getProfile({
        userId: 'me'
    })

    return profile.emailAddress || ''
}

export async function GET(request: Request) {
    console.log('Auth callback started')
    try {
        const requestUrl = new URL(request.url)
        const code = requestUrl.searchParams.get('code')

        if (!code) {
            console.error('No code provided')
            return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/auth/signin?error=no_code`)
        }

        console.log('Creating Supabase client')
        const supabase = createRouteHandlerClient({ cookies })

        console.log('Exchanging code for session')
        const { data: { session }, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

        if (exchangeError || !session) {
            console.error('Session exchange error:', exchangeError)
            return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/auth/signin?error=exchange_failed`)
        }

        if (!session.provider_token) {
            console.error('No provider token in session')
            return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/auth/signin?error=no_provider_token`)
        }

        console.log('Session exchange successful:', {
            hasSession: !!session,
            hasProviderToken: !!session.provider_token,
            hasUser: !!session.user,
            userId: session.user?.id
        })

        // Get user's email using the provider token
        console.log('Fetching user email with provider token')
        const userEmail = await getUserEmail(session.provider_token)

        if (!userEmail) {
            throw new Error('No email found in Gmail profile')
        }

        console.log('Got user email:', userEmail)

        // Update or create email session
        const sessionData = {
            user_id: session.user.id,
            email: userEmail.toLowerCase(),
            access_token: session.provider_token,
            refresh_token: session.provider_refresh_token,
            updated_at: new Date().toISOString()
        }

        const { error: upsertError } = await supabaseAdmin
            .from('email_sessions')
            .upsert(
                {
                    ...sessionData,
                    id: crypto.randomUUID(),
                    created_at: new Date().toISOString()
                },
                {
                    onConflict: 'email',
                    ignoreDuplicates: false
                }
            )

        if (upsertError) {
            console.error('Error storing session:', upsertError)
            throw upsertError
        }

        // Set up Gmail watch
        try {
            console.log('Setting up Gmail watch')
            await setupGmailWatch(session.provider_token, session.user.id)
            console.log('Gmail watch setup complete')
        } catch (watchError) {
            console.error('Error setting up Gmail watch:', watchError)
            // Continue even if watch setup fails
        }

        console.log('Auth callback completed, redirecting to home')
        return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}`)
    } catch (error: any) {
        console.error('Error in callback setup:', {
            error,
            message: error?.message || 'Unknown error',
            stack: error?.stack
        })
        return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/auth/signin?error=callback_failed`)
    }
}
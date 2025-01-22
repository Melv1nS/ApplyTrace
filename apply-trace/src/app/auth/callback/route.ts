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

// Initialize OAuth2 client
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`
)

async function getUserEmail(accessToken: string): Promise<string> {
    oauth2Client.setCredentials({
        access_token: accessToken
    })

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
    const { data: profile } = await gmail.users.getProfile({
        userId: 'me'
    })

    return profile.emailAddress || ''
}

interface PostgrestError {
    message: string;
    details?: string | null;
    hint?: string | null;
    code: string;
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

        console.log('Session exchange successful:', {
            hasSession: !!session,
            hasToken: !!session?.access_token,
            hasUser: !!session?.user,
            userId: session?.user?.id
        })

        console.log('Starting token storage process for user:', session.user.id)

        // Get user's email using the access token
        console.log('Fetching user email with token')
        const userEmail = await getUserEmail(session.access_token)
        console.log('Got user email:', userEmail)

        if (!userEmail) {
            throw new Error('No email found in Gmail profile')
        }

        console.log('Checking for existing session')
        const { data: existingSession, error: findError } = await supabaseAdmin
            .from('email_sessions')
            .select('*')
            .eq('email', userEmail.toLowerCase())
            .single()

        console.log('Find session result:', {
            error: findError,
            isNotFound: findError?.code === 'PGRST116'
        })

        const sessionData = {
            user_id: session.user.id,
            email: userEmail.toLowerCase(),
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            updated_at: new Date().toISOString()
        }

        console.log('Preparing session data:', {
            userId: sessionData.user_id,
            email: sessionData.email,
            hasAccessToken: !!sessionData.access_token,
            updatedAt: sessionData.updated_at
        })

        let result
        if (existingSession) {
            console.log('Updating existing session')
            result = await supabaseAdmin
                .from('email_sessions')
                .update(sessionData)
                .eq('email', userEmail.toLowerCase())
                .select()
        } else {
            console.log('Creating new session')
            result = await supabaseAdmin
                .from('email_sessions')
                .insert([{ ...sessionData, id: crypto.randomUUID() }])
                .select()
        }

        if (result.error) {
            console.error('Error storing session:', {
                error: result.error,
                ...result.error
            })
            throw result.error
        }

        // Set up Gmail watch after successful session storage
        try {
            console.log('Setting up Gmail watch')
            await setupGmailWatch(session.access_token, session.user.id)
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
        return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}`)
    }
}
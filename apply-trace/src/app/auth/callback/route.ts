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

async function getUserEmail(accessToken: string): Promise<string> {
    const oauth2Client = new google.auth.OAuth2()
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
    try {
        console.log('Auth callback started')
        const requestUrl = new URL(request.url)
        const code = requestUrl.searchParams.get('code')

        if (!code) {
            console.error('No code provided in callback')
            return NextResponse.redirect(new URL('/auth/signin?error=no_code', requestUrl.origin))
        }

        console.log('Creating Supabase client')
        const supabase = createRouteHandlerClient({ cookies })

        console.log('Exchanging code for session')
        const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code)

        if (error) {
            console.error('Error exchanging code for session:', error)
            return NextResponse.redirect(new URL('/auth/signin?error=auth_error', requestUrl.origin))
        }

        console.log('Session exchange successful:', {
            hasSession: !!session,
            hasToken: !!session?.provider_token,
            hasUser: !!session?.user,
            userId: session?.user?.id
        })

        // Set up Gmail watch if we have a valid session with provider token
        if (session?.provider_token && session?.user?.id) {
            try {
                console.log('Starting token storage process for user:', session.user.id)

                // Get user's email address
                console.log('Fetching user email with token')
                const userEmail = await getUserEmail(session.provider_token)
                if (!userEmail) {
                    console.error('Could not get user email')
                    throw new Error('Could not get user email')
                }

                console.log('Got user email:', userEmail)

                // First try to find existing session
                console.log('Checking for existing session')
                const { data: existingSession, error: findError } = await supabaseAdmin
                    .from('email_sessions')
                    .select('*')
                    .eq('user_id', session.user.id)
                    .single()

                if (findError) {
                    console.log('Find session result:', {
                        error: findError,
                        isNotFound: findError.code === 'PGRST116'
                    })
                }

                const sessionData = {
                    user_id: session.user.id,
                    email: userEmail.toLowerCase(),
                    access_token: session.provider_token,
                    updated_at: new Date().toISOString()
                }

                console.log('Preparing session data:', {
                    userId: sessionData.user_id,
                    email: sessionData.email,
                    hasAccessToken: !!sessionData.access_token,
                    updatedAt: sessionData.updated_at
                })

                let upsertError
                if (existingSession) {
                    console.log('Updating existing session:', existingSession.id)
                    const { error, data } = await supabaseAdmin
                        .from('email_sessions')
                        .update(sessionData)
                        .eq('id', existingSession.id)
                        .select()
                    upsertError = error
                    console.log('Update result:', { error, hasData: !!data })
                } else {
                    console.log('Creating new session')
                    const newSession = {
                        ...sessionData,
                        id: crypto.randomUUID(),
                        created_at: new Date().toISOString()
                    }
                    const { error, data } = await supabaseAdmin
                        .from('email_sessions')
                        .insert(newSession)
                        .select()
                    upsertError = error
                    console.log('Insert result:', { error, hasData: !!data })
                }

                if (upsertError) {
                    console.error('Error storing session:', {
                        error: upsertError,
                        code: upsertError.code,
                        details: upsertError.details,
                        hint: upsertError.hint
                    })
                    throw upsertError
                }

                // Verify the session was stored
                console.log('Verifying session storage')
                const { data: verifySession, error: verifyError } = await supabaseAdmin
                    .from('email_sessions')
                    .select('*')
                    .eq('email', userEmail.toLowerCase())
                    .single()

                if (verifyError || !verifySession) {
                    console.error('Failed to verify session storage:', {
                        error: verifyError,
                        hasSession: !!verifySession
                    })
                } else {
                    console.log('Session stored and verified:', {
                        id: verifySession.id,
                        email: verifySession.email,
                        userId: verifySession.user_id
                    })
                }

                // Set up Gmail watch
                console.log('Setting up Gmail watch')
                await setupGmailWatch(session.provider_token, session.user.id)
                console.log('Gmail watch setup complete')

            } catch (error) {
                console.error('Error in callback setup:', {
                    error: error as PostgrestError,
                    message: error instanceof Error ? error.message : 'Unknown error',
                    stack: error instanceof Error ? error.stack : undefined
                })
                // Continue with redirect even if setup fails
            }
        } else {
            console.log('Missing required session data:', {
                hasToken: !!session?.provider_token,
                hasUserId: !!session?.user?.id
            })
        }

        // URL to redirect to after sign in process completes
        console.log('Auth callback completed, redirecting to home')
        return NextResponse.redirect(new URL('/', requestUrl.origin))
    } catch (error) {
        console.error('Unexpected error in callback:', {
            error: error as PostgrestError,
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
        })
        return NextResponse.redirect(new URL('/auth/signin?error=unknown', request.url))
    }
}
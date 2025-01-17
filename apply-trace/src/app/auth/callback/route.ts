import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { setupGmailWatch } from '@/app/utils/gmailWatch'
import { google } from 'googleapis'

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

export async function GET(request: Request) {
    try {
        const requestUrl = new URL(request.url)
        const code = requestUrl.searchParams.get('code')

        if (!code) {
            console.error('No code provided in callback')
            return NextResponse.redirect(new URL('/auth/signin?error=no_code', requestUrl.origin))
        }

        const supabase = createRouteHandlerClient({ cookies })
        const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code)

        if (error) {
            console.error('Error exchanging code for session:', error)
            return NextResponse.redirect(new URL('/auth/signin?error=auth_error', requestUrl.origin))
        }

        // Set up Gmail watch if we have a valid session with provider token
        if (session?.provider_token && session?.user?.id) {
            try {
                console.log('Attempting to store token for user:', session.user.id)

                // Get user's email address
                const userEmail = await getUserEmail(session.provider_token)
                if (!userEmail) {
                    throw new Error('Could not get user email')
                }

                // Store token in Supabase
                const { error: upsertError } = await supabase
                    .from('email_sessions')
                    .upsert({
                        id: crypto.randomUUID(),
                        user_id: session.user.id,
                        email: userEmail,  // Add email to the record
                        access_token: session.provider_token,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    }, {
                        onConflict: 'user_id'
                    })

                if (upsertError) {
                    console.error('Error storing token:', upsertError)
                } else {
                    console.log('Token stored successfully')
                }

                await setupGmailWatch(session.provider_token, session.user.id)
            } catch (error) {
                console.error('Error setting up Gmail watch:', error)
                // Continue with redirect even if Gmail watch setup fails
            }
        } else {
            console.log('No provider token or user id in session:', {
                hasToken: !!session?.provider_token,
                hasUserId: !!session?.user?.id
            })
        }

        // URL to redirect to after sign in process completes
        return NextResponse.redirect(new URL('/', requestUrl.origin))
    } catch (error) {
        console.error('Unexpected error in callback:', error)
        return NextResponse.redirect(new URL('/auth/signin?error=unknown', request.url))
    }
}
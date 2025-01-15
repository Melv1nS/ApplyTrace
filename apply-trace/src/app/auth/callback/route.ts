import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { setupGmailWatch } from '@/app/utils/gmailWatch'

export async function GET(request: Request) {
    const requestUrl = new URL(request.url)
    const code = requestUrl.searchParams.get('code')

    if (code) {
        const supabase = createRouteHandlerClient({ cookies })
        const { data: { session } } = await supabase.auth.exchangeCodeForSession(code)

        // Set up Gmail watch if we have a valid session with provider token
        if (session?.provider_token) {
            await setupGmailWatch(session.provider_token)
        }
    }

    // URL to redirect to after sign in process completes
    return NextResponse.redirect(new URL('/', requestUrl.origin))
}
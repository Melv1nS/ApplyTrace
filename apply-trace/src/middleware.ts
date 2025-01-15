import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Add matcher for protected routes
export const config = {
    matcher: ['/', '/dashboard/:path*']
}

export async function middleware(req: NextRequest) {
    const res = NextResponse.next()
    const supabase = createMiddlewareClient({ req, res })
    const { data: { session } } = await supabase.auth.getSession()

    // If there's no session and we're not on an auth page, redirect to signin
    if (!session && !req.nextUrl.pathname.startsWith('/auth')) {
        const redirectUrl = req.nextUrl.clone()
        redirectUrl.pathname = '/auth/signin'
        return NextResponse.redirect(redirectUrl)
    }

    // If we have a session and we're on an auth page, redirect to home
    if (session && req.nextUrl.pathname.startsWith('/auth')) {
        const redirectUrl = req.nextUrl.clone()
        redirectUrl.pathname = '/'
        return NextResponse.redirect(redirectUrl)
    }

    return res
}

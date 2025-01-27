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
    const { data: { user } } = await supabase.auth.getUser()

    // If there's no user and we're not on an auth page, redirect to signin
    if (!user && !req.nextUrl.pathname.startsWith('/auth')) {
        const redirectUrl = req.nextUrl.clone()
        redirectUrl.pathname = '/auth/signin'
        return NextResponse.redirect(redirectUrl)
    }

    // If we have a user and we're on an auth page, redirect to home
    if (user && req.nextUrl.pathname.startsWith('/auth')) {
        const redirectUrl = req.nextUrl.clone()
        redirectUrl.pathname = '/'
        return NextResponse.redirect(redirectUrl)
    }

    return res
}

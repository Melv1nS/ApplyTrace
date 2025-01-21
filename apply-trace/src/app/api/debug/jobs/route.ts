import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Create a Supabase client with the service role key
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

export async function GET() {
    try {
        // Get all job applications
        const { data: jobs, error } = await supabaseAdmin
            .from('job_applications')
            .select('*')
            .order('updated_at', { ascending: false })

        if (error) {
            console.error('Error fetching jobs:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({
            count: jobs.length,
            jobs: jobs
        })
    } catch (error) {
        console.error('Error in debug endpoint:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
} 
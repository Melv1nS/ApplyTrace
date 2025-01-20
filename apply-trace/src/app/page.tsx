'use client'

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import JobBoard from '@/app/components/JobBoard'
import SignOutButton from '@/app/components/SignOutButton'

// Map backend status to frontend status
const statusMap = {
  APPLIED: 'applied',
  INTERVIEW_SCHEDULED: 'interviewing',
  OFFER_RECEIVED: 'offer',
  REJECTED: 'rejected',
  ARCHIVED: 'archived'
} as const

// Add type for backend status
type JobStatus = keyof typeof statusMap

interface JobApplication {
  id: string
  company_name: string
  role_title: string
  status: JobStatus
  updated_at: string
  notes?: string | null
}

export default function HomePage() {
  const [jobs, setJobs] = useState<JobApplication[]>([])
  const router = useRouter()
  const supabase = createClientComponentClient()

  useEffect(() => {
    // Check auth status
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/auth/signin')
        return
      }

      // Fetch initial jobs
      const { data: initialJobs } = await supabase
        .from('job_applications')
        .select('*')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false })

      if (initialJobs) {
        setJobs(initialJobs)
      }

      // Subscribe to changes
      const channel = supabase
        .channel('job_applications_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'job_applications',
            filter: `user_id=eq.${session.user.id}`
          },
          async (payload) => {
            console.log('Real-time update:', payload)

            // Refresh the entire list to ensure correct ordering
            const { data: updatedJobs } = await supabase
              .from('job_applications')
              .select('*')
              .eq('user_id', session.user.id)
              .order('updated_at', { ascending: false })

            if (updatedJobs) {
              setJobs(updatedJobs)
            }
          }
        )
        .subscribe()

      // Cleanup subscription
      return () => {
        channel.unsubscribe()
      }
    }

    checkAuth()
  }, [supabase, router])

  // Transform job applications to match JobCard interface
  const formattedJobs = jobs.map(job => ({
    id: job.id,
    company: job.company_name,
    position: job.role_title,
    status: statusMap[job.status as JobStatus],
    lastUpdated: job.updated_at,
    notes: job.notes
  }))

  return (
    <div className="min-h-screen bg-[#FAF7F2] p-6">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-[#2C1810] text-3xl font-semibold">Job Applications</h1>
        <SignOutButton />
      </div>
      <JobBoard jobs={formattedJobs} />
    </div>
  )
}

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

// Map frontend status to backend status
const reverseStatusMap = {
  applied: 'APPLIED',
  interviewing: 'INTERVIEW_SCHEDULED',
  offer: 'OFFER_RECEIVED',
  rejected: 'REJECTED',
  archived: 'ARCHIVED'
} as const

// Add type for backend status
type JobStatus = keyof typeof statusMap
type FrontendStatus = typeof statusMap[JobStatus]

interface JobApplication {
  id: string
  user_id: string
  company_name: string
  role_title: string
  status: JobStatus
  updated_at: string
  notes?: string | null
  location?: string
}

interface Job {
  id: string
  company: string
  position: string
  status: FrontendStatus
  lastUpdated: string
  location?: string
  notes?: string
}

export default function HomePage() {
  const [jobs, setJobs] = useState<JobApplication[]>([])
  const router = useRouter()
  const supabase = createClientComponentClient()

  const handleUpdate = async (jobId: string, updates: Partial<Job>) => {
    try {
      // Convert frontend updates to backend format
      const backendUpdates: Partial<JobApplication> = {
        ...(updates.company && { company_name: updates.company }),
        ...(updates.position && { role_title: updates.position }),
        ...(updates.status && { status: reverseStatusMap[updates.status] as JobStatus }),
        ...(updates.location !== undefined && { location: updates.location })
      }

      // Optimistically update UI
      setJobs(currentJobs => currentJobs.map(job =>
        job.id === jobId ? { ...job, ...backendUpdates } : job
      ))

      const { error } = await supabase
        .from('job_applications')
        .update({
          ...backendUpdates,
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId)

      if (error) {
        console.error('Error updating job:', error)
        // Revert optimistic update on error
        const { data } = await supabase
          .from('job_applications')
          .select('*')
          .eq('id', jobId)
          .single()

        if (data) {
          setJobs(currentJobs => currentJobs.map(job =>
            job.id === jobId ? data : job
          ))
        }
      }
    } catch (error) {
      console.error('Error updating job:', error)
    }
  }

  const handleDelete = async (jobId: string) => {
    try {
      // Optimistically update UI
      setJobs(currentJobs => currentJobs.filter(job => job.id !== jobId))

      const { error } = await supabase
        .from('job_applications')
        .update({
          is_deleted: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId)

      if (error) {
        console.error('Error deleting job:', error)
        // Revert optimistic update on error
        const { data } = await supabase
          .from('job_applications')
          .select('*')
          .eq('id', jobId)
          .single()

        if (data) {
          setJobs(currentJobs => [...currentJobs, data])
        }
      }
    } catch (error) {
      console.error('Error deleting job:', error)
    }
  }

  useEffect(() => {
    // Check auth status
    const checkAuth = async () => {
      console.log('Checking auth status...')
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()

      if (sessionError) {
        console.error('Session error:', {
          error: sessionError,
          message: sessionError.message,
          status: sessionError.status
        })
        router.push('/auth/signin')
        return
      }

      if (!session) {
        console.log('No session found, redirecting to signin')
        router.push('/auth/signin')
        return
      }

      console.log('Session found:', {
        userId: session.user.id,
        email: session.user.email,
        hasAccessToken: !!session.access_token,
        expiresAt: session.expires_at
      })

      // Fetch initial jobs
      console.log('Fetching initial jobs...')
      try {
        // Test authentication
        const { data: user, error: userError } = await supabase.auth.getUser()
        if (userError) {
          console.error('Error getting user:', userError)
          return
        }
        console.log('Authenticated as user:', {
          id: user.user?.id,
          email: user.user?.email
        })

        const { data: initialJobs, error: fetchError } = await supabase
          .from('job_applications')
          .select('*')
          .eq('user_id', session.user.id)
          .eq('is_deleted', false)
          .order('updated_at', { ascending: false })

        if (fetchError) {
          console.error('Error fetching jobs:', {
            error: fetchError,
            code: fetchError.code,
            details: fetchError.details,
            hint: fetchError.hint,
            message: fetchError.message
          })
          return
        }

        console.log('Initial jobs fetch response:', {
          success: true,
          jobsCount: initialJobs?.length ?? 0,
          firstJob: initialJobs?.[0]
        })

        if (initialJobs) {
          console.log('Initial jobs loaded:', initialJobs.length)
          setJobs(initialJobs)
        }

        // Subscribe to changes
        console.log('Setting up real-time subscription...', {
          userId: session.user.id,
          channelName: `realtime:job_applications:${session.user.id}`,
          config: {
            event: '*',
            schema: 'public',
            table: 'job_applications',
            filter: `user_id=eq.${session.user.id}`
          }
        })

        const channel = supabase
          .channel(`realtime:job_applications:${session.user.id}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'job_applications',
              filter: `user_id=eq.${session.user.id}`  // Match the RLS policy
            },
            (payload) => {
              console.log('Database change received:', {
                eventType: payload.eventType,
                new: payload.new,
                old: payload.old,
                table: payload.table,
                schema: payload.schema,
                timestamp: new Date().toISOString(),
                userId: session.user.id
              })

              // Check if this change is for the current user
              const jobData = (payload.new || payload.old) as JobApplication | undefined
              if (!jobData || jobData.user_id !== session.user.id) {
                console.log('Ignoring change for different user:', jobData?.user_id)
                return
              }

              // Handle the change based on event type
              if (payload.eventType === 'INSERT') {
                console.log('Handling INSERT:', {
                  newJob: payload.new,
                  currentJobsCount: jobs.length
                })
                setJobs(currentJobs => {
                  const newJobs = [payload.new as JobApplication, ...currentJobs];
                  console.log('Updated jobs after INSERT:', {
                    newJobsCount: newJobs.length,
                    firstJob: newJobs[0]
                  });
                  return newJobs;
                })
              } else if (payload.eventType === 'UPDATE') {
                console.log('Handling UPDATE:', {
                  oldJob: payload.old,
                  newJob: payload.new,
                  currentJobsCount: jobs.length
                })
                setJobs(currentJobs => {
                  const updatedJobs = currentJobs.map(job =>
                    job.id === payload.new.id ? payload.new as JobApplication : job
                  );
                  console.log('Updated jobs after UPDATE:', {
                    updatedJobsCount: updatedJobs.length,
                    updatedJob: payload.new
                  });
                  return updatedJobs;
                })
              } else if (payload.eventType === 'DELETE') {
                console.log('Handling DELETE:', {
                  oldJob: payload.old,
                  currentJobsCount: jobs.length
                })
                setJobs(currentJobs => {
                  const filteredJobs = currentJobs.filter(job => job.id !== payload.old.id);
                  console.log('Updated jobs after DELETE:', {
                    newJobsCount: filteredJobs.length,
                    deletedJobId: payload.old.id
                  });
                  return filteredJobs;
                })
              }
            }
          )
          .subscribe((status, err) => {
            console.log('Subscription status changed:', {
              status,
              error: err,
              timestamp: new Date().toISOString(),
              channelState: channel.state
            })

            if (err) {
              console.error('Subscription error:', err)
            }
          })

        // Log channel state periodically
        const intervalId = setInterval(() => {
          console.log('Channel state:', {
            state: channel.state,
            timestamp: new Date().toISOString()
          })
        }, 5000)

        // Cleanup subscription and interval
        return () => {
          console.log('Cleaning up subscription and interval')
          clearInterval(intervalId)
          channel.unsubscribe()
        }
      } catch (error) {
        console.error('Error fetching initial jobs:', error)
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
      <JobBoard jobs={formattedJobs} onDelete={handleDelete} onUpdate={handleUpdate} />
    </div>
  )
}

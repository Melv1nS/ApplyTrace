import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from "next/navigation"
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

export default async function ProtectedPage() {
  const supabase = createServerComponentClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    redirect("/auth/signin")
  }

  // Fetch job applications for current user
  const { data: jobApplications } = await supabase
    .from('job_applications')
    .select('*')
    .eq('user_id', session.user.id)
    .order('updated_at', { ascending: false })

  // Transform job applications to match JobCard interface
  const formattedJobs = jobApplications?.map(job => ({
    id: job.id,
    company: job.company_name,
    position: job.role_title,
    status: statusMap[job.status as JobStatus],
    lastUpdated: job.updated_at,
    notes: job.notes
  })) || []

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

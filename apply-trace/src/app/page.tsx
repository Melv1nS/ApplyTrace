import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import JobBoardContainer from './components/JobBoardContainer'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const supabase = createServerComponentClient({ cookies })

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError) {
      console.error('Auth error:', userError)
      await supabase.auth.signOut()
      redirect('/auth/signin')
    }

    if (!user) {
      redirect('/auth/signin')
    }

    return <JobBoardContainer />
  } catch (error) {
    console.error('Error in HomePage:', error)
    redirect('/auth/signin')
  }
}

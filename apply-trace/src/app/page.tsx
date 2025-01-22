import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import JobBoardContainer from './components/JobBoardContainer'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const supabase = createServerComponentClient({ cookies })

  try {
    const {
      data: { session },
      error: sessionError
    } = await supabase.auth.getSession()

    if (sessionError) {
      console.error('Session error:', sessionError)
      // Sign out to clear the session
      await supabase.auth.signOut()
      redirect('/auth/signin')
    }

    if (!session) {
      redirect('/auth/signin')
    }

    // Verify user exists
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('id', session.user.id)
      .single()

    if (userError || !user) {
      console.error('User error:', userError)
      // Sign out and redirect if user doesn't exist
      await supabase.auth.signOut()
      redirect('/auth/signin')
    }

    return <JobBoardContainer />
  } catch (error) {
    console.error('Error in HomePage:', error)
    redirect('/auth/signin')
  }
}

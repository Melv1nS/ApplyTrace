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

    // Only verify user in database if they've been signed in for a while
    // This gives Supabase time to create the user record after OAuth
    const signedInAt = new Date(user.confirmed_at || user.created_at)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)

    if (signedInAt < fiveMinutesAgo) {
      // Only check for long-running sessions
      const { data: dbUser, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single()

      if (userError || !dbUser) {
        console.error('User error:', userError)
        await supabase.auth.signOut()
        redirect('/auth/signin')
      }
    }

    return <JobBoardContainer />
  } catch (error) {
    console.error('Error in HomePage:', error)
    redirect('/auth/signin')
  }
}

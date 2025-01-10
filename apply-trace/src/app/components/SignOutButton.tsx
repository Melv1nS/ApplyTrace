'use client'

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'

export default function SignOutButton() {
    const router = useRouter()
    const supabase = createClientComponentClient()

    async function handleSignOut() {
        await supabase.auth.signOut()
        router.refresh()
    }

    return (
        <button
            onClick={handleSignOut}
            className="px-4 py-2 text-sm font-medium text-[#2C1810] hover:text-[#4A3427] transition-colors"
        >
            Sign Out
        </button>
    )
}

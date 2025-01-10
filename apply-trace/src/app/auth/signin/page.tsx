"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import Image from "next/image";

export default function SignIn() {
    const supabase = createClientComponentClient();

    const handleSignIn = async () => {
        await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/auth/callback`,
                scopes: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.metadata https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
            },
        });
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="max-w-md w-full space-y-8 p-8">
                <div className="text-center">
                    <h2 className="mt-6 text-3xl font-bold">Welcome to ApplyTrace</h2>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                        Track your job applications automatically
                    </p>
                </div>
                <button
                    onClick={handleSignIn}
                    className="w-full flex items-center justify-center gap-3 bg-white text-gray-900 hover:bg-gray-50 px-4 py-3 rounded-md border transition-colors"
                >
                    <Image
                        src="/google.svg"
                        alt="Google logo"
                        width={20}
                        height={20}
                        className="w-5 h-5"
                    />
                    Sign in with Google
                </button>
            </div>
        </div>
    );
}
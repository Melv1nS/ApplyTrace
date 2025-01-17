import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { PrismaClient } from "@prisma/client";
import GoogleProvider from "next-auth/providers/google";

const prisma = new PrismaClient();

const handler = NextAuth({
    adapter: PrismaAdapter(prisma),
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            authorization: {
                params: {
                    scope: 'openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.metadata',
                    access_type: 'offline',
                    prompt: 'consent',
                    response_type: 'code'
                }
            }
        })
    ],
    callbacks: {
        async session({ session, user, token }) {
            if (session.user) {
                session.user.id = user.id;
            }
            // Add the access token to the session
            if (token) {
                session.provider_token = token.accessToken;
            }
            return session;
        },
        async jwt({ token, account }) {
            // Persist the OAuth access_token to the token right after signin
            if (account) {
                token.accessToken = account.access_token;
            }
            return token;
        },
        async redirect({ url, baseUrl }) {
            return baseUrl;
        },
    },
    debug: process.env.NODE_ENV === "development",
});

export { handler as GET, handler as POST };
import NextAuth from "next-auth"

declare module "next-auth" {
    interface Session {
        provider_token?: string
        user: {
            id: string
            email: string
            name: string
            image?: string
        }
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        accessToken?: string
    }
} 
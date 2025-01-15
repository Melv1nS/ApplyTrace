import { google } from 'googleapis'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

interface WatchResponse {
    success: boolean;
    expiration?: string;
    historyId?: string;
    error?: string;
}

async function storeEmailSession(userId: string, accessToken: string) {
    const supabase = createClientComponentClient()

    await supabase.from('email_sessions').upsert({
        user_id: userId,
        access_token: accessToken,
        updated_at: new Date().toISOString()
    }, {
        onConflict: 'user_id'
    })
}

export async function setupGmailWatch(accessToken: string, userId: string): Promise<WatchResponse> {
    try {
        const oauth2Client = new google.auth.OAuth2()
        oauth2Client.setCredentials({
            access_token: accessToken
        })

        const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

        const response = await gmail.users.watch({
            userId: 'me',
            requestBody: {
                labelIds: ['INBOX'],
                topicName: `projects/${process.env.NEXT_PUBLIC_GOOGLE_CLOUD_PROJECT_ID}/topics/${process.env.NEXT_PUBLIC_PUBSUB_TOPIC_NAME}`,
                labelFilterAction: 'include'
            }
        })

        // Store the session information
        await storeEmailSession(userId, accessToken)

        return {
            success: true,
            expiration: response.data.expiration,
            historyId: response.data.historyId
        }
    } catch (error) {
        console.error('Error setting up Gmail watch:', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        }
    }
}

// ... rest of the file stays the same ... 
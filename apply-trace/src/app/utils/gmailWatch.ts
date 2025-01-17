import { google } from 'googleapis'

interface WatchResponse {
  success: boolean;
  expiration?: string;
  historyId?: string;
  error?: string;
}

export async function setupGmailWatch(accessToken: string, userId: string): Promise<WatchResponse> {
  try {
    if (!process.env.GOOGLE_CLOUD_PROJECT_ID || !process.env.PUBSUB_TOPIC_NAME) {
      console.error('Missing env vars:', {
        projectId: !!process.env.GOOGLE_CLOUD_PROJECT_ID,
        topicName: !!process.env.PUBSUB_TOPIC_NAME
      })
      throw new Error('Missing required environment variables for Gmail watch setup')
    }

    console.log('Setting up Gmail watch for user:', userId)
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({
      access_token: accessToken
    })

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
    const topicName = `projects/${process.env.GOOGLE_CLOUD_PROJECT_ID}/topics/${process.env.PUBSUB_TOPIC_NAME}`
    console.log('Using topic:', topicName)

    const response = await gmail.users.watch({
      userId: 'me',
      requestBody: {
        labelIds: ['INBOX'],
        topicName: topicName,
        labelFilterAction: 'include'
      }
    })

    console.log('Gmail watch setup successful:', {
      expiration: response.data.expiration,
      historyId: response.data.historyId
    })

    return {
      success: true,
      expiration: response.data.expiration ?? undefined,
      historyId: response.data.historyId ?? undefined
    }
  } catch (error) {
    console.error('Error setting up Gmail watch:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

export async function stopGmailWatch(accessToken: string): Promise<boolean> {
  try {
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({
      access_token: accessToken
    })

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
    await gmail.users.stop({
      userId: 'me'
    })

    return true
  } catch (error) {
    console.error('Error stopping Gmail watch:', error)
    return false
  }
}
import { google } from 'googleapis'

interface WatchResponse {
  success: boolean;
  expiration?: string;
  historyId?: string;
  error?: string;
}

export async function setupGmailWatch(accessToken: string): Promise<WatchResponse> {
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
        topicName: `projects/${process.env.GOOGLE_CLOUD_PROJECT_ID}/topics/${process.env.PUBSUB_TOPIC_NAME}`,
        labelFilterAction: 'include'
      }
    })

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
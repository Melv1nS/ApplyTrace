import { google } from 'googleapis'

export async function setupGmailWatch(accessToken: string) {
  try {
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({
      access_token: accessToken
    })

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    // Set up push notifications for the user's inbox
    await gmail.users.watch({
      userId: 'me',
      requestBody: {
        labelIds: ['INBOX'],
        topicName: process.env.GMAIL_TOPIC_NAME, // Google Cloud Pub/Sub topic
        labelFilterAction: 'include'
      }
    })

    return true
  } catch (error) {
    console.error('Error setting up Gmail watch:', error)
    return false
  }
}
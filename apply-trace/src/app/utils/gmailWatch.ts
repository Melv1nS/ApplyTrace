import { google } from 'googleapis'

interface WatchResponse {
  success: boolean;
  expiration?: string;
  historyId?: string;
  error?: string;
}

// Helper function for structured logging
function logDebug(stage: string, data?: Record<string, unknown>) {
  console.log(`[GMAIL_WATCH][${stage}]`, JSON.stringify(data || {}))
}

function logError(stage: string, error: unknown) {
  console.error(`[GMAIL_WATCH_ERROR][${stage}]`, JSON.stringify({
    message: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error ? error.stack : undefined,
    details: error
  }))
}

async function getServiceAccountAuth() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    logError('AUTH_CONFIG', {
      hasEmail: !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      hasKey: !!process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
    })
    throw new Error('Missing service account credentials')
  }

  try {
    logDebug('SERVICE_ACCOUNT_INFO', {
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      keyLength: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.length,
      hasBeginKey: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.includes('BEGIN PRIVATE KEY'),
      hasEndKey: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.includes('END PRIVATE KEY')
    })

    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/pubsub']
    })

    logDebug('AUTHORIZING_SERVICE_ACCOUNT')
    const credentials = await auth.authorize()
    logDebug('SERVICE_ACCOUNT_AUTHORIZED', {
      hasToken: !!credentials.access_token,
      tokenType: credentials.token_type,
      expiryDate: credentials.expiry_date
    })

    return auth
  } catch (error) {
    logError('SERVICE_ACCOUNT_AUTH_FAILED', error)
    throw error
  }
}

export async function setupGmailWatch(accessToken: string, userId: string): Promise<WatchResponse> {
  try {
    if (!process.env.GOOGLE_CLOUD_PROJECT_ID || !process.env.PUBSUB_TOPIC_NAME) {
      logError('CONFIG_ERROR', {
        projectId: !!process.env.GOOGLE_CLOUD_PROJECT_ID,
        topicName: !!process.env.PUBSUB_TOPIC_NAME,
        projectIdValue: process.env.GOOGLE_CLOUD_PROJECT_ID // Log actual project ID
      })
      throw new Error('Missing required environment variables for Gmail watch setup')
    }

    logDebug('SETUP_START', { userId })

    // Get service account auth for Pub/Sub operations
    const serviceAuth = await getServiceAccountAuth()

    // Set up Gmail client with user's access token
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({
      access_token: accessToken
    })

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
    const topicName = `projects/${process.env.GOOGLE_CLOUD_PROJECT_ID}/topics/${process.env.PUBSUB_TOPIC_NAME}`

    // Initialize Pub/Sub with service account
    const pubsub = google.pubsub({ version: 'v1', auth: serviceAuth })

    // Verify topic exists or create it
    try {
      logDebug('VERIFY_TOPIC', { topicName })
      await pubsub.projects.topics.get({ topic: topicName })
      logDebug('TOPIC_EXISTS')
    } catch (error) {
      const pubsubError = error as { response?: { status?: number } }
      if (pubsubError?.response?.status === 404) {
        logDebug('CREATING_TOPIC', { topicName })
        await pubsub.projects.topics.create({ name: topicName })
        logDebug('TOPIC_CREATED')
      } else {
        logError('TOPIC_ACCESS_ERROR', error)
        throw error
      }
    }

    logDebug('TOPIC_CONFIG', { topicName })

    const response = await gmail.users.watch({
      userId: 'me',
      requestBody: {
        labelIds: ['INBOX'],
        topicName: topicName,
        labelFilterAction: 'include'
      }
    })

    logDebug('SETUP_SUCCESS', {
      expiration: response.data.expiration,
      historyId: response.data.historyId
    })

    return {
      success: true,
      expiration: response.data.expiration ?? undefined,
      historyId: response.data.historyId ?? undefined
    }
  } catch (error) {
    logError('SETUP_FAILED', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

export async function stopGmailWatch(accessToken: string): Promise<boolean> {
  try {
    logDebug('STOP_START')
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({
      access_token: accessToken
    })

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
    await gmail.users.stop({
      userId: 'me'
    })

    logDebug('STOP_SUCCESS')
    return true
  } catch (error) {
    logError('STOP_FAILED', error)
    return false
  }
}
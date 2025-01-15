import { JobStatus } from '@prisma/client'

export interface EmailAnalysisResult {
    isJobRelated: boolean
    status: JobStatus
    companyName: string
    roleTitle: string
    confidence: number
    nextSteps?: string
    interviewDate?: string
    location?: string
    salary?: string
}

export interface EmailContent {
    subject: string
    body: string
    date: string
    from: string
    to: string
} 
import { GoogleGenerativeAI } from '@google/generative-ai'
import { JobStatus } from '@prisma/client'
import { EmailAnalysisResult, EmailContent } from '../types/job'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

const ANALYSIS_PROMPT = `You are an AI assistant specialized in analyzing job-related emails. Given an email's content, determine if it's related to a job application process and extract relevant details.

Analyze the following email content and respond in this exact JSON format:
{
  "isJobRelated": boolean,
  "status": "APPLIED" | "REJECTED" | "INTERVIEW" | "OFFER" | "ACCEPTED" | "WITHDRAWN",
  "companyName": string,
  "roleTitle": string,
  "confidence": number (0-1),
  "nextSteps": string (optional),
  "interviewDate": string (optional, ISO format),
  "location": string (optional),
  "salary": string (optional)
}

Consider these guidelines:
- APPLIED: Initial application confirmation or acknowledgment
- REJECTED: Clear rejection or "not moving forward"
- INTERVIEW: Interview invitation or scheduling
- OFFER: Job offer or discussion of compensation
- ACCEPTED: Confirmation of accepting an offer
- WITHDRAWN: Application withdrawn by candidate

Email Content:
Subject: {subject}
From: {from}
Date: {date}
Body: {body}
`

export async function analyzeEmail(email: EmailContent): Promise<EmailAnalysisResult> {
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-pro' })

        const prompt = ANALYSIS_PROMPT
            .replace('{subject}', email.subject)
            .replace('{from}', email.from)
            .replace('{date}', email.date)
            .replace('{body}', email.body)

        const result = await model.generateContent(prompt)
        const response = await result.response.text()

        try {
            const analysis = JSON.parse(response) as EmailAnalysisResult

            // Validate the status is a valid JobStatus
            if (!Object.values(JobStatus).includes(analysis.status)) {
                throw new Error('Invalid job status returned from LLM')
            }

            return {
                isJobRelated: analysis.isJobRelated,
                status: analysis.status,
                companyName: analysis.companyName || 'Unknown Company',
                roleTitle: analysis.roleTitle || 'Unknown Position',
                confidence: analysis.confidence,
                nextSteps: analysis.nextSteps,
                interviewDate: analysis.interviewDate,
                location: analysis.location,
                salary: analysis.salary
            }
        } catch (error) {
            console.error('Failed to parse LLM response:', error)
            throw new Error('Failed to parse email analysis result')
        }
    } catch (error) {
        console.error('Failed to analyze email:', error)
        throw error
    }
} 
export const JOB_EMAIL_ANALYSIS_PROMPT = `Analyze this email for job application related content. Subject: "\${subject}" Body: "\${emailBody}"
      
TASK:
1. Identify if this is a job-related email
2. Determine the exact type of email:
   - INTERVIEW_REQUEST if it contains ANY of:
     * Invitations to interviews/screenings
     * Scheduling interview times
     * Next steps in interview process
     * Technical screening requests
     * References to "next round" or "next step"
   - APPLICATION if it's an application confirmation
   - REJECTION if it's a rejection
   - OTHER if none of the above
3. Extract the exact company name - look for patterns like "at [Company]", "opportunities at [Company]", "careers at [Company]"
4. Extract the exact role/position title - look for patterns like "position of [Role]", "the [Role] position", "for the [Role]"

IMPORTANT PATTERNS TO RECOGNIZE:
- Interview requests often contain:
  * "invite you to", "would like to schedule", "next step", "next round"
  * "technical screen", "technical interview", "phone screen"
  * "schedule", "availability", "times that work"
- Application confirmations often contain:
  * "received your submission", "received your application", "successfully received"
- Rejections often contain:
  * "unfortunately", "regret to inform", "not moving forward", "other candidates"

Return a JSON object with these fields:
- isJobRelated (boolean): is this email related to a job application?
- type: either "INTERVIEW_REQUEST", "APPLICATION", "REJECTION", or "OTHER"
- companyName: the exact company name found (do not abbreviate or modify it)
- roleTitle: the exact role title as mentioned in the email
- confidence: number between 0 and 1 indicating confidence in this analysis

IMPORTANT: 
1. Return ONLY the raw JSON object, no markdown formatting
2. Never return "Unknown" for company or role if they are explicitly mentioned
3. Preserve exact company names and role titles as they appear
4. For confidence: use 0.9+ for clear matches
5. ANY mention of interviews, screenings, or next steps should be classified as INTERVIEW_REQUEST
6. Prioritize INTERVIEW_REQUEST over APPLICATION if there's any mention of interviews`; 
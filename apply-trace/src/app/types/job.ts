export interface Job {
    id: string
    company: string
    position: string
    status: 'applied' | 'interviewing' | 'offer' | 'rejected' | 'archived'
    lastUpdated: string
    appliedDate: string
    location?: string
    salary?: string
    notes?: string
} 
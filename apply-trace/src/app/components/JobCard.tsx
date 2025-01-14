"use client"

import { formatDistanceToNow } from 'date-fns'

interface Job {
    id: string
    company: string
    position: string
    status: 'applied' | 'interviewing' | 'offer' | 'rejected' | 'archived'
    lastUpdated: string
    // Optional fields you might want to add:
    location?: string
    salary?: string
    notes?: string
}

interface JobCardProps {
    job: Job
}

export default function JobCard({ job }: JobCardProps) {
    const timeAgo = formatDistanceToNow(new Date(job.lastUpdated), { addSuffix: true })

    return (
        <div className="bg-white border border-[#E8E2D9] rounded-md p-4 mb-2 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex justify-between items-start mb-2">
                <h3 className="font-medium text-[#2C1810] line-clamp-1">{job.company}</h3>
                <button className="text-[#8B7355] hover:text-[#6B4423] text-sm">
                    •••
                </button>
            </div>

            <p className="text-sm text-[#6B4423] mb-3 line-clamp-2">{job.position}</p>

            <div className="flex justify-between items-center text-xs">
                {job.location && (
                    <span className="text-[#8B7355]">📍 {job.location}</span>
                )}
                <span className="text-[#6B4423]">{timeAgo}</span>
            </div>
        </div>
    )
}

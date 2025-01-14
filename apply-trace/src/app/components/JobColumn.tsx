"use client"

import { Droppable } from '@hello-pangea/dnd'
import JobCard from './JobCard'

interface JobColumnProps {
    title: string
    color: string
    jobs: Job[]
}

export default function JobColumn({ title, color, jobs }: JobColumnProps) {
    return (
        <div className="flex-shrink-0 w-80 bg-white rounded-lg shadow-md">
            <div
                className="p-3 rounded-t-lg text-white font-medium"
                style={{ backgroundColor: color }}
            >
                {title} ({jobs.length})
            </div>
            <div className="p-2 min-h-[calc(100vh-12rem)]">
                {jobs.map(job => (
                    <JobCard key={job.id} job={job} />
                ))}
            </div>
        </div>
    )
}

"use client"

import { Droppable } from '@hello-pangea/dnd'
import JobCard from './JobCard'
import type { Job } from '@/app/types/job'

interface JobColumnProps {
    title: string
    color: string
    jobs: Job[]
    onDelete: (jobId: string) => void
    onUpdate: (jobId: string, updates: Partial<Job>) => void
}

export default function JobColumn({ title, color, jobs, onDelete, onUpdate }: JobColumnProps) {
    return (
        <div className="flex-shrink-0 w-80 bg-white rounded-lg shadow-md flex flex-col h-[calc(100vh-8rem)]">
            <div
                className="p-3 rounded-t-lg text-white font-medium sticky top-0 z-10"
                style={{ backgroundColor: color }}
            >
                {title} ({jobs.length})
            </div>
            <Droppable droppableId={title.toLowerCase()}>
                {(provided) => (
                    <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className="p-2 flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent hover:scrollbar-thumb-gray-400"
                    >
                        {jobs.map(job => (
                            <JobCard
                                key={job.id}
                                job={job}
                                onDelete={onDelete}
                                onUpdate={onUpdate}
                            />
                        ))}
                        {provided.placeholder}
                    </div>
                )}
            </Droppable>
        </div>
    )
}

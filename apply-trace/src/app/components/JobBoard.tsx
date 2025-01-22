"use client"

import { DragDropContext, Droppable } from '@hello-pangea/dnd'
import JobColumn from './JobColumn'
import { useState } from 'react'

interface Job {
    id: string
    company: string
    position: string
    status: 'applied' | 'interviewing' | 'offer' | 'rejected' | 'archived'
    lastUpdated: string
    location?: string
}

const columns = {
    applied: {
        title: 'Applied',
        color: '#8B7355'
    },
    interviewing: {
        title: 'Interviewing',
        color: '#87A987'
    },
    offer: {
        title: 'Offer',
        color: '#6B8E23'
    },
    rejected: {
        title: 'Rejected',
        color: '#BC8F8F'
    },
    archived: {
        title: 'Archived',
        color: '#9E9E9E'
    }
} as const

export default function JobBoard({
    jobs,
    onDelete,
    onUpdate
}: {
    jobs: Job[]
    onDelete: (jobId: string) => void
    onUpdate: (jobId: string, updates: Partial<Job>) => void
}) {
    return (
        <div className="flex gap-4 overflow-x-auto pb-4">
            {Object.entries(columns).map(([status, { title, color }]) => (
                <JobColumn
                    key={status}
                    title={title}
                    color={color}
                    jobs={jobs.filter(job => job.status === status)}
                    onDelete={onDelete}
                    onUpdate={onUpdate}
                />
            ))}
        </div>
    )
}

"use client"

import { DragDropContext, DropResult } from '@hello-pangea/dnd'
import JobColumn from './JobColumn'
import { Job } from '@/app/types/job'

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
    const handleDragEnd = (result: DropResult) => {
        const { destination, source, draggableId } = result

        // Dropped outside the list
        if (!destination) {
            return
        }

        // Dropped in the same position
        if (
            destination.droppableId === source.droppableId &&
            destination.index === source.index
        ) {
            return
        }

        // Update the job status
        const newStatus = destination.droppableId as Job['status']
        onUpdate(draggableId, { status: newStatus })
    }

    return (
        <DragDropContext onDragEnd={handleDragEnd}>
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
        </DragDropContext>
    )
}

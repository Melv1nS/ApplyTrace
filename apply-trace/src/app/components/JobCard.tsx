"use client"

import { format } from 'date-fns'
import { useState } from 'react'
import { Draggable } from '@hello-pangea/dnd'
import DeleteConfirmationModal from './DeleteConfirmationModal'
import type { Job } from '@/app/types/job'

interface JobCardProps {
    job: Job
    onDelete: (jobId: string) => void
    onUpdate: (jobId: string, updates: Partial<Job>) => void
    index: number
}

export default function JobCard({ job, onDelete, onUpdate, index }: JobCardProps) {
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
    const [isEditing, setIsEditing] = useState(false)
    const [editedValues, setEditedValues] = useState({
        company: job.company,
        position: job.position,
        location: job.location || ''
    })
    const formattedDate = format(
        new Date(job.appliedDate),
        'MMM d, yyyy h:mm a',
        { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }
    )

    const handleDelete = () => {
        setIsDeleteModalOpen(true)
    }

    const handleConfirmDelete = () => {
        onDelete(job.id)
        setIsDeleteModalOpen(false)
    }

    const handleEdit = () => {
        setIsEditing(true)
    }

    const handleSave = () => {
        onUpdate(job.id, {
            company: editedValues.company,
            position: editedValues.position,
            location: editedValues.location || undefined
        })
        setIsEditing(false)
    }

    const handleCancel = () => {
        setEditedValues({
            company: job.company,
            position: job.position,
            location: job.location || ''
        })
        setIsEditing(false)
    }

    return (
        <>
            <Draggable draggableId={job.id} index={index}>
                {(provided, snapshot) => (
                    <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        className={`bg-white border border-[#E8E2D9] rounded-md p-4 mb-2 shadow-sm transition-all ${snapshot.isDragging ? 'shadow-lg ring-2 ring-[#8B7355] ring-opacity-50' : 'hover:shadow-md'
                            }`}
                    >
                        <div className="flex justify-between items-start mb-2">
                            {isEditing ? (
                                <input
                                    type="text"
                                    value={editedValues.company}
                                    onChange={(e) => setEditedValues(prev => ({ ...prev, company: e.target.value }))}
                                    className="font-medium text-[#2C1810] border-b border-[#E8E2D9] focus:border-[#8B7355] outline-none px-1"
                                />
                            ) : (
                                <h3 className="font-medium text-[#2C1810] line-clamp-1">{job.company}</h3>
                            )}
                            <div className="flex gap-2">
                                {isEditing ? (
                                    <>
                                        <button
                                            onClick={handleSave}
                                            className="text-[#6B8E23] hover:text-[#556B2F] text-sm px-2 py-1 rounded-md hover:bg-green-50 transition-colors"
                                        >
                                            Save
                                        </button>
                                        <button
                                            onClick={handleCancel}
                                            className="text-[#8B7355] hover:text-[#6B4423] text-sm px-2 py-1 rounded-md hover:bg-red-50 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button
                                            onClick={handleEdit}
                                            className="text-[#8B7355] hover:text-[#6B4423] text-sm px-2 py-1 rounded-md hover:bg-gray-50 transition-colors"
                                        >
                                            ✎
                                        </button>
                                        <button
                                            onClick={handleDelete}
                                            className="text-[#8B7355] hover:text-red-600 text-sm px-2 py-1 rounded-md hover:bg-red-50 transition-colors"
                                        >
                                            ✕
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        {isEditing ? (
                            <input
                                type="text"
                                value={editedValues.position}
                                onChange={(e) => setEditedValues(prev => ({ ...prev, position: e.target.value }))}
                                className="text-sm text-[#6B4423] mb-3 w-full border-b border-[#E8E2D9] focus:border-[#8B7355] outline-none px-1"
                            />
                        ) : (
                            <p className="text-sm text-[#6B4423] mb-3 line-clamp-2">{job.position}</p>
                        )}

                        <div className="flex justify-between items-center text-xs">
                            {isEditing ? (
                                <input
                                    type="text"
                                    value={editedValues.location}
                                    onChange={(e) => setEditedValues(prev => ({ ...prev, location: e.target.value }))}
                                    placeholder="Add location"
                                    className="text-[#8B7355] border-b border-[#E8E2D9] focus:border-[#8B7355] outline-none px-1"
                                />
                            ) : job.location ? (
                                <span className="text-[#8B7355]">📍 {job.location}</span>
                            ) : null}
                            <span className="text-[#6B4423]">{formattedDate}</span>
                        </div>
                    </div>
                )}
            </Draggable>

            <DeleteConfirmationModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleConfirmDelete}
                jobTitle={job.position}
                companyName={job.company}
            />
        </>
    )
}

"use client"

interface DeleteConfirmationModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    jobTitle: string
    companyName: string
}

export default function DeleteConfirmationModal({
    isOpen,
    onClose,
    onConfirm,
    jobTitle,
    companyName
}: DeleteConfirmationModalProps) {
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
                <h3 className="text-lg font-medium text-[#2C1810] mb-2">Delete Job Application</h3>
                <p className="text-[#6B4423] mb-4">
                    Are you sure you want to delete the {jobTitle} position at {companyName}? This action cannot be undone.
                </p>
                <div className="flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-[#8B7355] hover:text-[#6B4423] rounded-md transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>
    )
} 
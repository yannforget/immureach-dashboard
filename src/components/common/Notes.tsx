import { type ReactNode } from 'react'

interface NoteProps {
    children: ReactNode
}

/**
 * Small attribution card, styled to match the Ribbon (rounded-lg border border-slate-200 bg-white shadow-sm) and full width.
 */
export function Notes({ children }: NoteProps) {
    return (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="text-sm text-slate-500">{children}</div>
        </div>
    )
}
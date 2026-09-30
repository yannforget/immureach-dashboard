import { useState } from 'react'

// Small "?" bubble revealing a help text on hover or click.
export function InfoBubble({ text }: { text: string }) {
    const [open, setOpen] = useState(false)

    return (
        <div
            className="relative flex-shrink-0"
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
        >
            <div
                onClick={e => {
                    e.stopPropagation()
                    setOpen(!open)
                }}
                className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-full border border-slate-400 leading-none text-slate-400 hover:border-slate-600 hover:text-slate-600"
                role="button"
                tabIndex={0}
                aria-label="Plus d'informations"
                style={{ fontSize: '10px', fontWeight: '600' }}
            >
                ?
            </div>
            {open && (
                <div className="absolute left-0 top-5 z-50 w-64 rounded-md bg-slate-900 px-3 py-3 text-xs font-normal text-white shadow-lg">
                    <div className="text-slate-300">{text}</div>
                    <div className="absolute -top-1 left-1.5 h-2 w-2 rotate-45 bg-slate-900"></div>
                </div>
            )}
        </div>
    )
}

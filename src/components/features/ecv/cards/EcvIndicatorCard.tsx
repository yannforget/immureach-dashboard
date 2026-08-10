import React, { useState } from 'react'

interface EcvIndicatorCardProps {
    label: string
    value: string
    description?: string
    subtext?: string  // add nb of visited health areas in nb visited zone card 
}

export function EcvIndicatorCard({ label, value, description, subtext }: EcvIndicatorCardProps) {
    const [showTooltip, setShowTooltip] = useState(false)

    return (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-left">
            <div className="flex items-center justify-between gap-1">
                <h3 className="text-xs font-semibold text-slate-700">{label}</h3>
                {description && (
                    <div
                        className="relative flex-shrink-0"
                        onMouseEnter={() => setShowTooltip(true)}
                        onMouseLeave={() => setShowTooltip(false)}
                    >
                        <div
                            onClick={e => {
                                e.stopPropagation()
                                setShowTooltip(!showTooltip)
                            }}
                            className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-full border border-slate-400 leading-none text-slate-400 hover:border-slate-600 hover:text-slate-600"
                            role="button"
                            tabIndex={0}
                            title="Plus d'informations"
                            style={{ fontSize: '10px', fontWeight: '600' }}
                        >
                            ?
                        </div>
                        {showTooltip && (
                            <div className="absolute right-0 top-5 z-50 w-64 rounded-md bg-slate-900 px-3 py-3 text-xs text-white shadow-lg">
                                <div className="text-slate-300">{description}</div>
                                <div className="absolute -top-1 right-2 h-2 w-2 rotate-45 bg-slate-900"></div>
                            </div>
                        )}
                    </div>
                )}
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
            {subtext && (
                <p className="mt-1 text-xs text-slate-400">{subtext}</p>
            )}
        </div>
    )
}
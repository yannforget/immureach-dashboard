import { Fragment, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { CoverageTone } from '@/lib/utils/ecvFormat'
import { ZERO_DOSE_RAMP } from '@/lib/charts/theme'

// Value colour per tone on a neutral white card. Full class names so
// Tailwind picks them up.
const TONE_VALUE_CLASSES: Record<CoverageTone | 'neutral', string> = {
    neutral: 'text-slate-900',
    red: 'text-red-600',
    orange: 'text-orange-500',
    yellow: 'text-yellow-500',
    green: 'text-green-600',
}

// The zero-dose value takes the dark end of the zero-dose map ramp (inline
// style, since Tailwind classes can't be built from a runtime constant).
const ZERO_DOSE_VALUE_STYLE: CSSProperties = { color: ZERO_DOSE_RAMP[1] }

interface EcvIndicatorCardProps {
    label: string
    value: string | string[]  // several strings share a line, wrapping only between them
    description?: string
    subtext?: string  // add nb of visited health areas in nb visited zone card 
    confidenceInterval?: string  // 95% CI, shown in the help tooltip
    centered?: boolean  // center the text horizontally; the value block is also centered vertically below the label
    tone?: CoverageTone | 'zeroDose'  // colours the value
    plainValue?: boolean  // value in regular weight at the tab-label size instead of large bold
    compact?: boolean  // tighter padding and a smaller value, for dense card grids
}

export function EcvIndicatorCard({ label, value, description, subtext, confidenceInterval, centered = false, tone, plainValue = false, compact = false }: EcvIndicatorCardProps) {
    const [showTooltip, setShowTooltip] = useState(false)
    // The tooltip opens to the right of the help icon so it does not hide the
    // card's value; when that would overflow the viewport (rightmost cards) it
    // opens above the icon instead.
    const tooltipRef = useRef<HTMLDivElement>(null)
    const [tooltipAbove, setTooltipAbove] = useState(false)
    useLayoutEffect(() => {
        if (!showTooltip) {
            setTooltipAbove(false)
            return
        }
        const rect = tooltipRef.current?.getBoundingClientRect()
        if (rect && rect.right > window.innerWidth - 8) setTooltipAbove(true)
    }, [showTooltip])
    const isZeroDose = tone === 'zeroDose'
    const valueClass = TONE_VALUE_CLASSES[tone == null || isZeroDose ? 'neutral' : tone]

    return (
        <div className={`relative rounded-lg border border-slate-200 bg-white px-4 ${compact ? 'py-2' : 'py-3'} ${centered ? 'flex flex-col text-center' : 'text-left'}`}>
            {/* The help icon is pinned to the card's top-right corner so it does not
                push a centered label off-center */}
            <div>
                <h3 className={`${centered ? 'px-5' : 'pr-5'} text-xs font-semibold text-slate-700`}>{label}</h3>
                {(description || confidenceInterval) && (
                    <div
                        className={`absolute right-4 ${compact ? 'top-2' : 'top-3'}`}
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
                            <div
                                ref={tooltipRef}
                                className={`absolute z-50 w-64 rounded-md bg-slate-900 px-3 py-3 text-left text-xs text-white shadow-lg ${tooltipAbove ? 'bottom-6 right-0' : '-top-2 left-6'}`}
                            >
                                {description && <div className="text-slate-300">{description}</div>}
                                {confidenceInterval && (
                                    <div className={`${description ? 'mt-2' : ''} font-medium text-white`}>{confidenceInterval}</div>
                                )}
                                <div className={`absolute h-2 w-2 rotate-45 bg-slate-900 ${tooltipAbove ? '-bottom-1 right-1' : '-left-1 top-3'}`}></div>
                            </div>
                        )}
                    </div>
                )}
            </div>
            {/* In a centered card the label stays on top (aligned with its neighbours'
                labels) and the value block is centered in the remaining height */}
            <div className={centered ? 'flex flex-1 flex-col justify-center' : undefined}>
                {/* Same size as single values; each part of a multi-part value is kept
                    whole so a narrow card wraps between parts, not mid-part */}
                <p className={`${compact ? 'mt-1' : 'mt-2'} ${plainValue ? 'text-sm font-normal' : compact ? 'text-xl font-bold leading-tight' : 'text-2xl font-bold'} ${isZeroDose ? '' : valueClass}`} style={isZeroDose ? ZERO_DOSE_VALUE_STYLE : undefined}>
                    {Array.isArray(value)
                        ? value.map((part, i) => (
                            <Fragment key={part}>
                                {i > 0 && ' '}
                                <span className="whitespace-nowrap">{part}</span>
                            </Fragment>
                        ))
                        : value}
                </p>
                {subtext && (
                    <p className="mt-1 text-xs text-slate-400">{subtext}</p>
                )}
            </div>
        </div>
    )
}
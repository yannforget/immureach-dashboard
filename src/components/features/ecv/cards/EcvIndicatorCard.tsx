import { Fragment, useState } from 'react'
import type { CSSProperties } from 'react'
import type { CoverageTone } from '@/lib/utils/ecvFormat'
import { ZERO_DOSE_RAMP } from '@/lib/charts/theme'

// Tinted background, border and value colour per tone; no tone keeps the
// neutral white card. Full class names so Tailwind picks them up.
const TONE_CLASSES: Record<CoverageTone | 'neutral', { card: string; value: string }> = {
    neutral: { card: 'border-slate-200 bg-white', value: 'text-slate-900' },
    red: { card: 'border-red-200 bg-red-50', value: 'text-red-700' },
    orange: { card: 'border-orange-200 bg-orange-50', value: 'text-orange-700' },
    yellow: { card: 'border-yellow-300 bg-yellow-50', value: 'text-yellow-700' },
    green: { card: 'border-green-200 bg-green-50', value: 'text-green-700' },
}

// The zero-dose tone takes its colours from the zero-dose map ramp (inline
// styles, since Tailwind classes can't be built from a runtime constant):
// light end as background, dark end for the value and a blend of both for
// the border.
const [ZD_LIGHT, ZD_DARK] = ZERO_DOSE_RAMP
const ZERO_DOSE_STYLES: { card: CSSProperties; value: CSSProperties } = {
    card: { backgroundColor: ZD_LIGHT, borderColor: `color-mix(in srgb, ${ZD_LIGHT} 75%, ${ZD_DARK})` },
    value: { color: ZD_DARK },
}

interface EcvIndicatorCardProps {
    label: string
    value: string | string[]  // several strings share a line, wrapping only between them
    description?: string
    subtext?: string  // add nb of visited health areas in nb visited zone card 
    confidenceInterval?: string  // 95% CI displayed lightly next to the value
    centered?: boolean  // center the text horizontally; the value block is also centered vertically below the label
    tone?: CoverageTone | 'zeroDose'  // colours the card (background, border, value)
}

export function EcvIndicatorCard({ label, value, description, subtext, confidenceInterval, centered = false, tone }: EcvIndicatorCardProps) {
    const [showTooltip, setShowTooltip] = useState(false)
    const isZeroDose = tone === 'zeroDose'
    const toneClasses = TONE_CLASSES[tone == null || isZeroDose ? 'neutral' : tone]

    return (
        <div className={`relative rounded-lg border ${isZeroDose ? '' : toneClasses.card} px-4 py-3 ${centered ? 'flex flex-col text-center' : 'text-left'}`} style={isZeroDose ? ZERO_DOSE_STYLES.card : undefined}>
            {/* The help icon is pinned to the card's top-right corner so it does not
                push a centered label off-center */}
            <div>
                <h3 className={`${centered ? 'px-5' : 'pr-5'} text-xs font-semibold text-slate-700`}>{label}</h3>
                {description && (
                    <div
                        className="absolute right-4 top-3"
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
                            <div className="absolute right-0 top-5 z-50 w-64 rounded-md bg-slate-900 px-3 py-3 text-left text-xs text-white shadow-lg">
                                <div className="text-slate-300">{description}</div>
                                <div className="absolute -top-1 right-2 h-2 w-2 rotate-45 bg-slate-900"></div>
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
                <p className={`mt-2 text-2xl font-bold ${isZeroDose ? '' : toneClasses.value}`} style={isZeroDose ? ZERO_DOSE_STYLES.value : undefined}>
                    {Array.isArray(value)
                        ? value.map((part, i) => (
                            <Fragment key={part}>
                                {i > 0 && ' '}
                                <span className="whitespace-nowrap">{part}</span>
                            </Fragment>
                        ))
                        : value}
                </p>
                {confidenceInterval && (
                    // Container query on a wrapper (not the card, which would trap the tooltip's
                    // z-index): font size scales with the card width so the CI stays on one line
                    <div className="mt-0.5 [container-type:inline-size]">
                        <p className="whitespace-nowrap text-[length:clamp(10.5px,7cqi,15px)] font-normal leading-tight text-slate-400">
                            {confidenceInterval}
                        </p>
                    </div>
                )}
                {subtext && (
                    <p className="mt-1 text-xs text-slate-400">{subtext}</p>
                )}
            </div>
        </div>
    )
}
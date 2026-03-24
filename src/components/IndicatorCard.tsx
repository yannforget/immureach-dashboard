import { useState } from 'react'
import { useDashboardStore } from '@/store/dashboardStore'
import type { MetricKey } from '@/types'

interface IndicatorCardProps {
  metricKey: MetricKey
  label: string
  value: number  // percentage (0-100)
  count: number  // vaccinated count or zero-dose child count
  isZeroDose: boolean
}

export function IndicatorCard({
  metricKey,
  label,
  value,
  count,
  isZeroDose,
}: IndicatorCardProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const selectedMetric = useDashboardStore(s => s.selectedMetric)
  const setMetric = useDashboardStore(s => s.setMetric)

  const isSelected = selectedMetric === metricKey

  const displayValue = Math.round(value)
  const suffix = '%'
  const formattedCount = Math.round(count).toLocaleString()
  const countLabel = isZeroDose ? `${formattedCount} (6-24 mo)` : `${formattedCount} (6-24 mo)`

  return (
    <button
      onClick={() => setMetric(metricKey)}
      className={`rounded-lg border px-4 py-3 text-left transition-all ${
        isSelected
          ? 'border-teal-600 bg-teal-50 shadow-md'
          : 'border-slate-200 bg-white hover:border-teal-400'
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        <h3 className="text-sm font-semibold text-slate-700">{label}</h3>
        <div
          className="relative flex-shrink-0"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <div
            onClick={(e) => {
              e.stopPropagation()
              setShowTooltip(!showTooltip)
            }}
            className="w-4 h-4 rounded-full border border-slate-400 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:border-slate-600 cursor-pointer leading-none"
            role="button"
            tabIndex={0}
            title="More information"
            style={{ fontSize: '10px', fontWeight: '600' }}
          >
            ?
          </div>
          {showTooltip && (
            <div className="absolute right-0 top-5 z-10 w-56 rounded-md bg-slate-900 px-3 py-2 text-xs text-white shadow-lg">
              <div className="space-y-0.5">
                {isZeroDose ? (
                  <>
                    <div>Zero-dose children (6-24 months)</div>
                    <div>From ImmuReach models (national immunization surveys)</div>
                    <div>Count: % × population (GRID3 data)</div>
                  </>
                ) : (
                  <>
                    <div>Coverage from ImmuReach models</div>
                    <div>(national immunization surveys, 6-24 months)</div>
                    <div># of children: % × population (GRID3 data)</div>
                  </>
                )}
              </div>
              <div className="absolute -top-1 right-2 h-2 w-2 rotate-45 bg-slate-900"></div>
            </div>
          )}
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-900">
        {displayValue}
        <span className="text-sm text-slate-600">{suffix}</span>
      </p>
      <p className="text-xs text-slate-500">{countLabel}</p>
    </button>
  )
}

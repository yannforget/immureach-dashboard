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
  const selectedMetric = useDashboardStore(s => s.selectedMetric)
  const setMetric = useDashboardStore(s => s.setMetric)

  const isSelected = selectedMetric === metricKey

  const displayValue = Math.round(value)
  const suffix = '%'
  const formattedCount = Math.round(count).toLocaleString()
  const subtitle = isZeroDose ? `${formattedCount} children` : `${formattedCount} vaccinated`

  return (
    <button
      onClick={() => setMetric(metricKey)}
      className={`rounded-lg border px-4 py-3 text-left transition-all ${
        isSelected
          ? 'border-teal-600 bg-teal-50 shadow-md'
          : 'border-slate-200 bg-white hover:border-teal-400'
      }`}
    >
      <h3 className="text-sm font-semibold text-slate-700">{label}</h3>
      <p className="mt-2 text-2xl font-bold text-slate-900">
        {displayValue}
        <span className="text-sm text-slate-600">{suffix}</span>
      </p>
      <p className="text-xs text-slate-500">{subtitle}</p>
    </button>
  )
}

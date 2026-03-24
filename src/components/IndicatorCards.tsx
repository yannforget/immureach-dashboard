import { useMemo } from 'react'
import { IndicatorCard } from './IndicatorCard'
import { useDashboardStore } from '@/store/dashboardStore'
import { useProvinceData } from '@/hooks/useProvinceData'
import { useZoneData } from '@/hooks/useZoneData'
import { METRIC_KEYS, METRIC_META } from '@/lib/dataUtils'

export function IndicatorCards() {
  const selectedProvince = useDashboardStore(s => s.selectedProvince)
  const provinces = useProvinceData()
  const zones = useZoneData(selectedProvince)

  // Aggregate data based on selection
  const aggregateData = useMemo(() => {
    const rows = selectedProvince ? zones : provinces

    const aggregates: Record<string, { sum: number; count: number; countSum: number }> = {}

    METRIC_KEYS.forEach(metricKey => {
      aggregates[metricKey] = { sum: 0, count: 0, countSum: 0 }

      const meta = METRIC_META[metricKey]

      rows.forEach(row => {
        const value = (row.properties as any)[metricKey]
        if (typeof value === 'number' && value >= 0) {
          aggregates[metricKey].sum += value
          aggregates[metricKey].count += 1

          // Sum up the actual child counts from the _count columns
          const countValue = (row.properties as any)[meta.countKey]
          if (typeof countValue === 'number' && countValue >= 0) {
            aggregates[metricKey].countSum += countValue
          }
        }
      })
    })

    return aggregates
  }, [selectedProvince, provinces, zones])

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-slate-700">Key Indicators</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {METRIC_KEYS.map(metricKey => {
          const meta = METRIC_META[metricKey]
          const aggregate = aggregateData[metricKey]
          const avg = aggregate.count > 0 ? aggregate.sum / aggregate.count : 0

          // For all metrics: display the percentage (multiply by 100)
          // Pass the actual child count from the _count columns
          const displayValue = avg * 100
          const count = aggregate.countSum

          return (
            <IndicatorCard
              key={metricKey}
              metricKey={metricKey}
              label={meta.label}
              value={displayValue}
              count={count}
              isZeroDose={meta.isZeroDose}
            />
          )
        })}
      </div>
    </div>
  )
}

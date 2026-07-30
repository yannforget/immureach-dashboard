import { useMemo } from 'react'
import { IndicatorCardZeroDose } from './IndicatorCardZeroDose'
import { useDashboardStore } from '@/store/dashboardStore'
import { useProvinceData } from '@/hooks/useProvinceData'
import { useZoneData } from '@/hooks/useZoneData'
import { METRIC_KEYS, METRIC_META } from '@/lib/dataUtils'

export function IndicatorCardsZeroDose() {
  const selectedProvince = useDashboardStore(s => s.selectedProvince)
  const selectedZoneId = useDashboardStore(s => s.selectedZoneId)
  const provinces = useProvinceData()
  const zones = useZoneData(selectedProvince)

  // Pick the single row when a zone or province is selected; otherwise
  // compute the national value as a population-weighted aggregate via the
  // pre-computed pred_*_count columns (count / pop_6_24mo).
  const cards = useMemo(() => {
    const zoneRow = selectedZoneId ? zones.find(z => z.id === selectedZoneId) : undefined
    const provinceRow = selectedProvince
      ? provinces.find(p => p.displayName === selectedProvince)
      : undefined
    const scopeRow = zoneRow ?? provinceRow

    return METRIC_KEYS.map(metricKey => {
      const meta = METRIC_META[metricKey]
      let value: number = 0
      let count: number = 0

      if (scopeRow) {
        const v = (scopeRow.properties as any)[metricKey]
        const c = (scopeRow.properties as any)[meta.countKey]
        if (typeof v === 'number') value = v * 100
        if (typeof c === 'number') count = c
      } else {
        let countSum = 0
        let popSum = 0
        provinces.forEach(p => {
          const c = (p.properties as any)[meta.countKey]
          const pop = (p.properties as any).pop_6_24mo
          if (typeof c === 'number' && typeof pop === 'number') {
            countSum += c
            popSum += pop
          }
        })
        if (popSum > 0) {
          value = (countSum / popSum) * 100
          count = countSum
        }
      }

      return { metricKey, meta, value, count }
    })
  }, [selectedProvince, selectedZoneId, provinces, zones])

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-slate-700">Indicateurs clefs</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {cards.map(({ metricKey, meta, value, count }) => (
          <IndicatorCardZeroDose
            key={metricKey}
            metricKey={metricKey}
            label={meta.label}
            value={value}
            count={count}
            isZeroDose={meta.isZeroDose}
          />
        ))}
      </div>
    </div>
  )
}

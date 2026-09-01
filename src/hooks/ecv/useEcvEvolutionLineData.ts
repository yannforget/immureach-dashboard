import { useMemo } from 'react'
import { useData } from '@/context/DataContext'
import { useDashboardStore } from '@/store/dashboardStore'
import { normalizeAreaName } from '@/lib/utils/ecvVaccCov'
import { ECV_METRIC_META } from '@/lib/utils/constants'
import { useZoneData } from '../common/useZoneData'
import type { EcvMetricKey, EcvVaccCovRow } from '@/types'

export interface EcvLineSeries {
  key: EcvMetricKey
  name: string
  values: (number | null)[]
  ciLow: (number | null)[]
  ciHigh: (number | null)[]
}

export interface EcvLineData {
  years: number[]
  series: EcvLineSeries[]
}

// Resolves one ecv_vaccination_coverage.csv row per survey year for the scope
// implied by the ribbon (zone -> province -> national fallback, identical to
// useEcvVaccCovRow), then projects the requested metric keys onto a
// { years, series } shape for the evolution line chart. Series whose values
// are null for every year are dropped so missing indicators never render.
export function useEcvEvolutionLineData(metricKeys: EcvMetricKey[]): EcvLineData {
  const { ecvVaccCov } = useData()
  const selectedProvince = useDashboardStore(s => s.selectedProvince)
  const selectedZoneId = useDashboardStore(s => s.selectedZoneId)
  const zones = useZoneData(selectedProvince)

  return useMemo(() => {
    const zoneName = selectedZoneId
      ? zones.find(z => z.id === selectedZoneId)?.displayName ?? null
      : null
    const zoneKey = normalizeAreaName(zoneName)
    const provinceKey = normalizeAreaName(selectedProvince)

    const years = Array.from(new Set(ecvVaccCov.map(r => r.year))).sort()

    const resolveRow = (year: number): EcvVaccCovRow | null => {
      if (zoneKey) {
        return (
          ecvVaccCov.find(
            r =>
              r.level === 'zone' &&
              r.year === year &&
              normalizeAreaName(r.zone) === zoneKey &&
              (!provinceKey || normalizeAreaName(r.province) === provinceKey),
          ) ?? null
        )
      }
      if (provinceKey) {
        return (
          ecvVaccCov.find(
            r =>
              r.level === 'province' &&
              r.year === year &&
              normalizeAreaName(r.province) === provinceKey,
          ) ?? null
        )
      }
      return ecvVaccCov.find(r => r.level === 'national' && r.year === year) ?? null
    }

    const rows = years.map(resolveRow)

    const series = metricKeys
      .map(key => ({
        key,
        name: ECV_METRIC_META[key].label,
        values: rows.map(row => row?.metrics[key].pct ?? null),
        ciLow: rows.map(row => row?.metrics[key].ciLow ?? null),
        ciHigh: rows.map(row => row?.metrics[key].ciHigh ?? null),
      }))
      .filter(s => s.values.some(v => v != null))

    return { years, series }
  }, [ecvVaccCov, metricKeys, selectedProvince, selectedZoneId, zones])
}

import { useMemo } from 'react'
import { useData } from '@/context/DataContext'
import { useDashboardStore } from '@/store/dashboardStore'
import { normalizeAreaName, zoneJoinKey } from '@/lib/utils/ecvVaccCov'
import { ECV_METRIC_META } from '@/lib/utils/constants'
import { useEcvScope } from './useEcvScope'
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
// implied by the ribbon (milieu and age group, then zone -> province -> national fallback,
// identical to useEcvVaccCovRow), then projects the requested metric keys onto
// a { years, series } shape for the evolution line chart. Series whose values
// are null for every year are dropped so missing indicators never render.
//
// Zone rows are matched on the (province, zone) pair, never on the zone name
// alone: see zoneJoinKey.
export function useEcvEvolutionLineData(metricKeys: EcvMetricKey[]): EcvLineData {
  const { ecvVaccCov } = useData()
  const selectedMilieu = useDashboardStore(s => s.selectedMilieu)
  const selectedAgeGroup = useDashboardStore(s => s.selectedAgeGroup)
  const { provinceKey, zoneKey } = useEcvScope()

  return useMemo(() => {
    // The x axis stays the survey's full year range whatever the milieu, so a
    // milieu that is missing from one round leaves a gap in the line instead
    // of shortening the axis.
    const years = Array.from(new Set(ecvVaccCov.map(r => r.year))).sort()
    const inMilieu = ecvVaccCov.filter(
      r => r.milieu === selectedMilieu && r.ageGroup === selectedAgeGroup,
    )

    const resolveRow = (year: number): EcvVaccCovRow | null => {
      const candidates = inMilieu.filter(r => r.year === year)
      if (zoneKey) {
        return (
          candidates.find(
            r => r.level === 'zone' && zoneJoinKey(r.province, r.zone) === zoneKey,
          ) ?? null
        )
      }
      if (provinceKey) {
        return (
          candidates.find(
            r =>
              r.level === 'province' &&
              normalizeAreaName(r.province) === provinceKey,
          ) ?? null
        )
      }
      return candidates.find(r => r.level === 'national') ?? null
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
  }, [ecvVaccCov, metricKeys, selectedMilieu, selectedAgeGroup, provinceKey, zoneKey])
}

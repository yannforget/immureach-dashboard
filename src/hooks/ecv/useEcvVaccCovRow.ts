import { useMemo } from 'react'
import { useDashboardStore } from '@/store/dashboardStore'
import { useData } from '@/context/DataContext'
import { normalizeAreaName, zoneJoinKey } from '@/lib/utils/ecvVaccCov'
import { useEcvScope } from './useEcvScope'
import type { EcvVaccCovRow } from '@/types'

// Picks the single ecv_vaccination_coverage.csv row matching the ribbon's
// filters (year, milieu, province, zone), used by the ECV vaccine bar chart.
// Falls back progressively: zone -> province -> national, mirroring
// useKeyEcvData's drill-down logic.
//
// Zone rows are matched on the (province, zone) pair, never on the zone name
// alone: see zoneJoinKey.
export function useEcvVaccCovRow(): EcvVaccCovRow | null {
  const { ecvVaccCov } = useData()
  const selectedYear = useDashboardStore(s => s.selectedYear)
  const selectedMilieu = useDashboardStore(s => s.selectedMilieu)
  const { provinceKey, zoneKey } = useEcvScope()

  return useMemo(() => {
    const rows = ecvVaccCov.filter(
      r => r.year === selectedYear && r.milieu === selectedMilieu,
    )

    if (zoneKey) {
      return (
        rows.find(r => r.level === 'zone' && zoneJoinKey(r.province, r.zone) === zoneKey) ??
        null
      )
    }

    if (provinceKey) {
      return (
        rows.find(
          r => r.level === 'province' && normalizeAreaName(r.province) === provinceKey,
        ) ?? null
      )
    }

    return rows.find(r => r.level === 'national') ?? null
  }, [ecvVaccCov, selectedYear, selectedMilieu, provinceKey, zoneKey])
}

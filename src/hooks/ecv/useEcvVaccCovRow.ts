import { useMemo } from 'react'
import { useDashboardStore } from '@/store/dashboardStore'
import { useData } from '@/context/DataContext'
import { normalizeAreaName } from '@/lib/utils/ecvVaccCov'
import { useZoneData } from '../useZoneData'
import type { EcvVaccCovRow } from '@/types'

// Picks the single ecv_vaccination_coverage.csv row matching the ribbon's
// filters (year, province, zone), used by the ECV vaccine bar chart. Falls
// back progressively: zone -> province -> national, mirroring
// useKeyEcvData's drill-down logic.
export function useEcvVaccCovRow(): EcvVaccCovRow | null {
  const { ecvVaccCov } = useData()
  const selectedYear = useDashboardStore(s => s.selectedYear)
  const selectedProvince = useDashboardStore(s => s.selectedProvince)
  const selectedZoneId = useDashboardStore(s => s.selectedZoneId)
  const zones = useZoneData(selectedProvince)

  return useMemo(() => {
    const zoneName = selectedZoneId
      ? zones.find(z => z.id === selectedZoneId)?.displayName ?? null
      : null
    const zoneKey = normalizeAreaName(zoneName)
    const provinceKey = normalizeAreaName(selectedProvince)

    if (zoneKey) {
      return (
        ecvVaccCov.find(
          r =>
            r.level === 'zone' &&
            r.year === selectedYear &&
            normalizeAreaName(r.zone) === zoneKey &&
            (!provinceKey || normalizeAreaName(r.province) === provinceKey),
        ) ?? null
      )
    }

    if (provinceKey) {
      return (
        ecvVaccCov.find(
          r => r.level === 'province' && r.year === selectedYear && normalizeAreaName(r.province) === provinceKey,
        ) ?? null
      )
    }

    return ecvVaccCov.find(r => r.level === 'national' && r.year === selectedYear) ?? null
  }, [ecvVaccCov, selectedYear, selectedProvince, selectedZoneId, zones])
}
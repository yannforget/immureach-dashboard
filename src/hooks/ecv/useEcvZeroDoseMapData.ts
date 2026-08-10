import { useMemo } from 'react'
import { useData } from '@/context/DataContext'
import { useDashboardStore } from '@/store/dashboardStore'
import { normalizeAreaName } from '@/lib/utils/ecvVaccCov'
import { useProvinceData } from '../common/useProvinceData'
import { useZoneData } from '../common/useZoneData'
import type { ProvinceRow, ZoneRow } from '@/types'

export interface EcvMapFeatureValue {
  mapKey: string
  displayName: string
  pct: number | null
  ciLow: number | null
  ciHigh: number | null
}

// Joins ecv_vaccination_coverage.csv's Zéro_dose values onto the dashboard's
// province/zone geometries by (normalized) name, at whichever granularity
// the ribbon's province filter implies — provinces when nothing is
// selected, zones (scoped to the selected province) once one is. Mirrors
// the level-switching behaviour of the existing zerodose CoverageMap.
export function useEcvZeroDoseMapData(): {
  features: (ProvinceRow | ZoneRow)[]
  values: EcvMapFeatureValue[]
  mapName: 'drc-provinces' | 'drc-zones'
} {
  const { ecvVaccCov } = useData()
  const selectedYear = useDashboardStore(s => s.selectedYear)
  const selectedProvince = useDashboardStore(s => s.selectedProvince)
  const provinces = useProvinceData()
  const zones = useZoneData(selectedProvince)

  const features = selectedProvince ? zones : provinces
  const mapName = selectedProvince ? 'drc-zones' : 'drc-provinces'

  const values = useMemo(() => {
    const level = selectedProvince ? 'zone' : 'province'
    const provinceKey = normalizeAreaName(selectedProvince)

    const rows = ecvVaccCov.filter(
      r =>
        r.level === level &&
        r.year === selectedYear &&
        (level === 'province' || !provinceKey || normalizeAreaName(r.province) === provinceKey),
    )

    const byName = new Map<string, (typeof rows)[number]>()
    for (const r of rows) {
      const key = normalizeAreaName(level === 'zone' ? r.zone : r.province)
      if (key) byName.set(key, r)
    }

    return features.map(f => {
      const row = byName.get(normalizeAreaName(f.displayName))
      const zd = row?.metrics.zero_dose
      return {
        mapKey: f.mapKey,
        displayName: f.displayName,
        pct: zd?.pct ?? null,
        ciLow: zd?.ciLow ?? null,
        ciHigh: zd?.ciHigh ?? null,
      }
    })
  }, [ecvVaccCov, selectedYear, selectedProvince, features])

  return { features, values, mapName }
}
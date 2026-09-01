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
  // True for zones outside the selected province (zone-level view only).
  // They keep their real data in the tooltip but render grey on the map.
  dimmed?: boolean
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
  // All zones (not just the selected province's) so out-of-province zones can
  // still surface their ECV data in the map tooltip.
  const allZones = useZoneData(null)

  const features = selectedProvince ? zones : provinces
  const mapName = selectedProvince ? 'drc-zones' : 'drc-provinces'

  const values = useMemo(() => {
    const level = selectedProvince ? 'zone' : 'province'

    // Keep every row of the selected level so dimmed (out-of-province) zones
    // still resolve their real data for the tooltip.
    const rows = ecvVaccCov.filter(r => r.level === level && r.year === selectedYear)

    const byName = new Map<string, (typeof rows)[number]>()
    for (const r of rows) {
      const key = normalizeAreaName(level === 'zone' ? r.zone : r.province)
      if (key) byName.set(key, r)
    }

    const toValue = (f: ProvinceRow | ZoneRow, dimmed = false): EcvMapFeatureValue => {
      const row = byName.get(normalizeAreaName(f.displayName))
      const zd = row?.metrics.zero_dose
      return {
        mapKey: f.mapKey,
        displayName: f.displayName,
        pct: zd?.pct ?? null,
        ciLow: zd?.ciLow ?? null,
        ciHigh: zd?.ciHigh ?? null,
        dimmed,
      }
    }

    if (!selectedProvince) return features.map(f => toValue(f))

    // Zone level: map over every DRC zone so out-of-province zones keep their
    // data in the tooltip, but dim (grey) the ones outside the province.
    return allZones.map(f => toValue(f, f.provinceId !== selectedProvince))
  }, [ecvVaccCov, selectedYear, selectedProvince, features, allZones])

  return { features, values, mapName }
}
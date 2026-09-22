import { useMemo } from 'react'
import { useDashboardStore } from '@/store/dashboardStore'
import { normalizeAreaName, zoneJoinKey } from '@/lib/utils/ecvVaccCov'
import { useZoneData } from '../common/useZoneData'

export interface EcvScope {
  // Cleaned names, for labels.
  provinceName: string | null
  zoneName: string | null
  // Normalized join keys, '' when nothing is selected at that level.
  // `zoneKey` is a (province, zone) pair — see zoneJoinKey.
  provinceKey: string
  zoneKey: string
}

// Resolves the ribbon's province/zone selection into the keys the ECV CSVs
// are joined on, so every ECV hook derives them the same way.
//
// The province half of `zoneKey` is read off the selected zone's own geometry
// rather than off the province filter: it is then always the pair the
// boundaries file records, which is what the ECV scripts canonicalise their
// province/zone columns against. Matching on the zone name alone would pick
// the wrong "Bili" (Nord Ubangi vs Bas Uele) or "Lubunga" (Kasaï Central vs
// Tshopo).
export function useEcvScope(): EcvScope {
  const selectedProvince = useDashboardStore(s => s.selectedProvince)
  const selectedZoneId = useDashboardStore(s => s.selectedZoneId)
  // Every zone, not just the selected province's, so a zone id still resolves
  // if the province filter is cleared while a zone is selected.
  const zones = useZoneData(null)

  return useMemo(() => {
    const zone = selectedZoneId ? zones.find(z => z.id === selectedZoneId) ?? null : null

    return {
      provinceName: selectedProvince,
      zoneName: zone?.displayName ?? null,
      provinceKey: normalizeAreaName(selectedProvince),
      zoneKey: zone ? zoneJoinKey(zone.provinceId, zone.displayName) : '',
    }
  }, [selectedProvince, selectedZoneId, zones])
}

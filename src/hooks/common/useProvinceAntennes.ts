import { useMemo } from 'react'
import type { AntenneGroup, ZoneRow } from '@/types'
import { useZoneData } from '@/hooks/common/useZoneData'
import { ANTENNE_PALETTE } from '@/lib/charts/theme'

// Returns the antenne groupings for the given province, or null if the
// province has no antenne data (most provinces are uncovered).
export function useProvinceAntennes(province: string | null): AntenneGroup[] | null {
  const zones = useZoneData(province)

  return useMemo(() => {
    if (!province) return null

    const byAntenne = new Map<string, ZoneRow[]>()
    for (const zone of zones) {
      const a = zone.properties.antenne
      if (!a) continue
      const bucket = byAntenne.get(a) ?? []
      bucket.push(zone)
      byAntenne.set(a, bucket)
    }

    if (byAntenne.size === 0) return null

    const names = [...byAntenne.keys()].sort()
    return names.map((antenne, i) => {
      const members = byAntenne.get(antenne)!
      // Head resolution: exact displayName match first, then substring
      // fallback (case-insensitive). Many antennes don't have a zone with
      // their exact name (e.g. "Kikwit" only appears in "Kikwit Nord" /
      // "Kikwit Sud") and we still want to anchor the marker somewhere.
      const lower = antenne.toLowerCase()
      const head =
        members.find(z => z.displayName === antenne) ??
        members.find(z => z.displayName.toLowerCase().includes(lower)) ??
        null
      return {
        antenne,
        color: ANTENNE_PALETTE[i % ANTENNE_PALETTE.length],
        headMapKey: head?.mapKey ?? null,
        headCentroid: head?.centroid ?? null,
        memberMapKeys: members.map(z => z.mapKey),
      }
    })
  }, [zones, province])
}

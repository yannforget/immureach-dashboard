import { useMemo } from 'react'
import type { ZoneRow } from '@/types'
import { useData } from '@/context/DataContext'

export function useZoneData(provinceId: string | null): ZoneRow[] {
  const { zones } = useData()

  return useMemo(() => {
    const filtered = provinceId
      ? zones.filter(zone => zone.provinceId === provinceId)
      : zones

    return [...filtered].sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr'))
  }, [zones, provinceId])
}
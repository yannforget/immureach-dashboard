import { useMemo } from 'react'
import type { ZoneRow } from '@/types'
import { useData } from '@/context/DataContext'

export function useZoneData(provinceId: string | null): ZoneRow[] {
  const { zones } = useData()

  return useMemo(() => {
    if (!provinceId) {
      return zones
    }

    return zones.filter(zone => zone.provinceId === provinceId)
  }, [zones, provinceId])
}

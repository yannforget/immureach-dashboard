import { useMemo } from 'react'
import { useDashboardStore } from '@/store/dashboardStore'
import { useProvinceData } from './useProvinceData'
import { useZoneData } from './useZoneData'
import type { TableMode, ProvinceRow, ZoneRow } from '@/types'

export function useTableData(): {
  mode: TableMode
  rows: (ProvinceRow | ZoneRow)[]
  selectedZoneName: string | null
} {
  const selectedProvince = useDashboardStore(s => s.selectedProvince)
  const selectedZoneId = useDashboardStore(s => s.selectedZoneId)

  const allProvinces = useProvinceData()
  const allZones = useZoneData(selectedProvince)

  return useMemo(() => {
    if (selectedZoneId) {
      const zone = allZones.find(z => z.id === selectedZoneId)
      return {
        mode: 'detail',
        rows: zone ? [zone] : [],
        selectedZoneName: zone?.displayName || null,
      }
    }

    if (selectedProvince) {
      return {
        mode: 'zone',
        rows: allZones,
        selectedZoneName: null,
      }
    }

    return {
      mode: 'province',
      rows: allProvinces,
      selectedZoneName: null,
    }
  }, [selectedProvince, selectedZoneId, allProvinces, allZones])
}

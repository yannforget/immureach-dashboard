import { useMemo } from 'react'
import { useDashboardStore } from '@/store/dashboardStore'
import { useData } from '@/context/DataContext'
import { useZoneData } from './useZoneData'
import type { KeyEcvRow } from '@/types'

// Picks the single key_ecv.csv row matching the ribbon's 3 filters
// (year, province, zone). Falls back progressively: zone -> province ->
// national, mirroring useTableData's drill-down logic.
export function useKeyEcvData(): KeyEcvRow | null {
    const { keyEcv } = useData()
    const selectedYear = useDashboardStore(s => s.selectedYear)
    const selectedProvince = useDashboardStore(s => s.selectedProvince)
    const selectedZoneId = useDashboardStore(s => s.selectedZoneId)
    const zones = useZoneData(selectedProvince)

    return useMemo(() => {
        const zoneName = selectedZoneId
            ? zones.find(z => z.id === selectedZoneId)?.displayName ?? null
            : null

        if (zoneName) {
            return (
                keyEcv.find(
                    r =>
                        r.level === 'zone' &&
                        r.year === selectedYear &&
                        r.zone === zoneName &&
                        (!selectedProvince || r.province === selectedProvince)
                ) ?? null
            )
        }

        if (selectedProvince) {
            return (
                keyEcv.find(
                    r => r.level === 'province' && r.year === selectedYear && r.province === selectedProvince
                ) ?? null
            )
        }

        return keyEcv.find(r => r.level === 'national' && r.year === selectedYear) ?? null
    }, [keyEcv, selectedYear, selectedProvince, selectedZoneId, zones])
}
import { useMemo } from 'react'
import { useDashboardStore } from '@/store/dashboardStore'
import { useData } from '@/context/DataContext'
import { pickEcvScopeRow } from '@/lib/utils/ecvScope'
import { useEcvScope } from './useEcvScope'
import type { KeyEcvRow } from '@/types'

// The single key_ecv.csv row matching the ribbon's 4 filters (year, milieu,
// province, zone); see pickEcvScopeRow.
export function useKeyEcvData(): KeyEcvRow | null {
    const { keyEcv } = useData()
    const selectedYear = useDashboardStore(s => s.selectedYear)
    const selectedMilieu = useDashboardStore(s => s.selectedMilieu)
    const { provinceKey, zoneKey } = useEcvScope()

    return useMemo(
        () => pickEcvScopeRow(keyEcv, selectedYear, selectedMilieu, provinceKey, zoneKey),
        [keyEcv, selectedYear, selectedMilieu, provinceKey, zoneKey]
    )
}

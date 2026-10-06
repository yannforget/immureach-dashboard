import { useMemo } from 'react'
import { useDashboardStore } from '@/store/dashboardStore'
import { useData } from '@/context/DataContext'
import { pickEcvScopeRow } from '@/lib/utils/ecvScope'
import { useEcvScope } from './useEcvScope'
import type { IndicatorsEcvRow } from '@/types'

// The single indicators_ecv.csv row matching the ribbon's 5 filters (year,
// age group, milieu, province, zone); see pickEcvScopeRow.
export function useIndicatorsEcvData(): IndicatorsEcvRow | null {
    const { indicatorsEcv } = useData()
    const selectedYear = useDashboardStore(s => s.selectedYear)
    const selectedAgeGroup = useDashboardStore(s => s.selectedAgeGroup)
    const selectedMilieu = useDashboardStore(s => s.selectedMilieu)
    const { provinceKey, zoneKey } = useEcvScope()

    return useMemo(
        () =>
            pickEcvScopeRow(
                indicatorsEcv.filter(r => r.ageGroup === selectedAgeGroup),
                selectedYear,
                selectedMilieu,
                provinceKey,
                zoneKey
            ),
        [indicatorsEcv, selectedYear, selectedAgeGroup, selectedMilieu, provinceKey, zoneKey]
    )
}

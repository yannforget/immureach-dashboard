import { useMemo } from 'react'
import { useDashboardStore } from '@/store/dashboardStore'
import { useData } from '@/context/DataContext'
import { normalizeAreaName, zoneJoinKey } from '@/lib/utils/ecvVaccCov'
import { useEcvScope } from './useEcvScope'
import type { KeyEcvRow } from '@/types'

// Picks the single key_ecv.csv row matching the ribbon's 4 filters
// (year, milieu, province, zone). Falls back progressively:
// zone -> province -> national. A domain with no child of the selected milieu
// has no row at all, so the result is null and the cards read as empty rather
// than silently showing the whole-sample figure.
//
// Zone rows are matched on the (province, zone) pair, never on the zone name
// alone: see zoneJoinKey.
export function useKeyEcvData(): KeyEcvRow | null {
    const { keyEcv } = useData()
    const selectedYear = useDashboardStore(s => s.selectedYear)
    const selectedMilieu = useDashboardStore(s => s.selectedMilieu)
    const { provinceKey, zoneKey } = useEcvScope()

    return useMemo(() => {
        const rows = keyEcv.filter(
            r => r.year === selectedYear && r.milieu === selectedMilieu
        )

        if (zoneKey) {
            return (
                rows.find(
                    r => r.level === 'zone' && zoneJoinKey(r.province, r.zone) === zoneKey
                ) ?? null
            )
        }

        if (provinceKey) {
            return (
                rows.find(
                    r =>
                        r.level === 'province' &&
                        normalizeAreaName(r.province) === provinceKey
                ) ?? null
            )
        }

        return rows.find(r => r.level === 'national') ?? null
    }, [keyEcv, selectedYear, selectedMilieu, provinceKey, zoneKey])
}

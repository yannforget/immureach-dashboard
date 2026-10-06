import { useMemo } from 'react'
import { EcvIndicatorCard } from './EcvIndicatorCard'
import { useIndicatorsEcvData } from '@/hooks'
import { useDashboardStore } from '@/store/dashboardStore'
import { AGE_GROUP_LABELS } from '@/types'
import { ECV_SERIES_KEYS, ECV_SERIES_META } from '@/lib/utils/constants'
import { formatCi, formatPercent } from '@/lib/utils/ecvFormat'

// "Indicateurs clés" of the ECV tab: for each vaccine, the share of children
// who received every dose of its schedule (indicators_ecv.csv).
export function EcvSeriesCardGrid() {
    const row = useIndicatorsEcvData()
    const selectedAgeGroup = useDashboardStore(s => s.selectedAgeGroup)

    const cards = useMemo(
        () =>
            ECV_SERIES_KEYS.map(key => {
                const v = row?.series[key]
                return {
                    key,
                    label: ECV_SERIES_META[key].label,
                    value: formatPercent(v?.pct ?? null),
                    confidenceInterval: formatCi(v?.pct ?? null, v?.ciLow ?? null, v?.ciHigh ?? null),
                    description: `${ECV_SERIES_META[key].description} Enfants de ${AGE_GROUP_LABELS[selectedAgeGroup]}, enquête ECV.`,
                }
            }),
        [row, selectedAgeGroup]
    )

    return (
        <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-700">Indicateurs clés</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
                {cards.map(c => (
                    <EcvIndicatorCard key={c.key} label={c.label} value={c.value} confidenceInterval={c.confidenceInterval} description={c.description} />
                ))}
            </div>
            {!row && (
                <p className="text-xs text-slate-400">
                    Aucune donnée ECV pour cette sélection (année / âge / milieu / province / zone).
                </p>
            )}
        </div>
    )
}

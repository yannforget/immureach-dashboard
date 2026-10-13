import { useMemo } from 'react'
import { EcvIndicatorCard } from './EcvIndicatorCard'
import { useEcvVaccCovRow, useIndicatorsEcvData } from '@/hooks'
import { useDashboardStore } from '@/store/dashboardStore'
import { AGE_GROUP_LABELS } from '@/types'
import { ECV_SERIES_KEYS, ECV_SERIES_META } from '@/lib/utils/constants'
import { coverageTone, formatCi, formatPercent } from '@/lib/utils/ecvFormat'

// "Indicateurs clés" of the ECV tab: for each vaccine, the share of children
// who received every dose of its schedule (indicators_ecv.csv), next to
// the zero-dose share (ecv_vaccination_coverage.csv, same source as the map).
export function EcvSeriesCardGrid() {
    const row = useIndicatorsEcvData()
    const covRow = useEcvVaccCovRow()
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
                    tone: coverageTone(v?.pct ?? null),
                    description: `${ECV_SERIES_META[key].description} Enfants de ${AGE_GROUP_LABELS[selectedAgeGroup]}, enquête ECV.`,
                }
            }),
        [row, selectedAgeGroup]
    )

    const zeroDoseCard = useMemo(() => {
        const zd = covRow?.metrics.zero_dose
        return {
            label: 'Enfants zéro dose',
            value: formatPercent(zd?.pct ?? null),
            confidenceInterval: formatCi(zd?.pct ?? null, zd?.ciLow ?? null, zd?.ciHigh ?? null),
            description: `Proportion d'enfants zéro dose (aucune dose d'aucun vaccin). Enfants de ${AGE_GROUP_LABELS[selectedAgeGroup]}, enquête ECV.`,
        }
    }, [covRow, selectedAgeGroup])

    return (
        <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-700">Indicateurs clés</h2>
            {/* Zero-dose card on the left, stretched to the height of the two
                rows of vaccine cards on its right. */}
            <div className="grid gap-3 lg:grid-cols-5">
                <EcvIndicatorCard label={zeroDoseCard.label} value={zeroDoseCard.value} confidenceInterval={zeroDoseCard.confidenceInterval} description={zeroDoseCard.description} tone="zeroDose" centered />
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-4">
                    {cards.map(c => (
                        <EcvIndicatorCard key={c.key} label={c.label} value={c.value} confidenceInterval={c.confidenceInterval} description={c.description} tone={c.tone} centered />
                    ))}
                </div>
            </div>
            {!row && (
                <p className="text-xs text-slate-400">
                    Aucune donnée ECV pour cette sélection (année / âge / milieu / province / zone).
                </p>
            )}
        </div>
    )
}

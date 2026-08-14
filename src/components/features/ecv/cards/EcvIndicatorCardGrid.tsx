import { useMemo } from 'react'
import { EcvIndicatorCard } from './EcvIndicatorCard'
import { useKeyEcvData } from '@/hooks'

const formatNumber = (v: number | null): string => (v == null ? '—' : Math.round(v).toLocaleString())
const formatPercent = (v: number | null): string => (v == null ? '—' : `${Math.round(v)}%`)
const formatCi = (low: number | null, high: number | null): string | undefined =>
    low != null && high != null ? `IC 95 % : ${low.toFixed(1)} % – ${high.toFixed(1)} %` : undefined

export function EcvIndicatorCardGrid() {
    const row = useKeyEcvData()

    const cards = useMemo(
        () => [
            {
                key: 'nb_people',
                label: 'Enfants enquêtés',
                value: formatNumber(row?.nb_people ?? null),
                confidenceInterval: undefined,
                description: "Nombre d'enfants couverts par l'enquête ECV pour la sélection courante (année, province, zone).",
            },
            {
                key: 'nb_zones',
                label: 'Zones de santé enquêtées',
                value: formatNumber(row?.nb_zones ?? null),
                confidenceInterval: undefined,
                description: "Nombre de zones de santé couvertes par l'enquête ECV pour la sélection courante.",
                subtext: row?.nb_areas != null ? `${formatNumber(row.nb_areas)} aires de santé enquêtées` : undefined,
            },
            {
                key: 'penta_cov',
                label: 'Couverture Penta',
                value: formatPercent(row?.penta_cov ?? null),
                confidenceInterval: formatCi(row?.penta_cov_low ?? null, row?.penta_cov_high ?? null),
                description: "Couverture vaccinale pentavalente mesurée par l'enquête ECV.",
            },
            {
                key: 'zdc_cov',
                label: 'Enfants zéro dose',
                value: formatPercent(row?.zdc_cov ?? null),
                confidenceInterval: formatCi(row?.zdc_cov_low ?? null, row?.zdc_cov_high ?? null),
                description: "Proportion d'enfants zéro dose mesurée par l'enquête ECV.",
            },
        ],
        [row]
    )

    return (
        <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-700">Chiffres clés ECV</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {cards.map(c => (
                    <EcvIndicatorCard key={c.key} label={c.label} value={c.value} confidenceInterval={c.confidenceInterval} description={c.description} subtext={c.subtext} />
                ))}
            </div>
            {!row && (
                <p className="text-xs text-slate-400">
                    Aucune donnée ECV pour cette sélection (année / province / zone).
                </p>
            )}
        </div>
    )
}
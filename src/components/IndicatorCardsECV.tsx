import { useMemo } from 'react'
import { IndicatorCardECV } from './IndicatorCardECV'
import { useKeyEcvData } from '@/hooks/useKeyEcvData'

const formatNumber = (v: number | null): string => (v == null ? '—' : Math.round(v).toLocaleString())
const formatPercent = (v: number | null): string => (v == null ? '—' : `${Math.round(v * 100)}%`)

export function IndicatorCardsECV() {
    const row = useKeyEcvData()

    const cards = useMemo(
        () => [
            {
                key: 'nb_people',
                label: 'Personnes enquêtées',
                value: formatNumber(row?.nb_people ?? null),
                description: "Nombre de personnes couvertes par l'enquête ECV pour la sélection courante (année, province, zone).",
            },
            {
                key: 'nb_zones',
                label: 'Zones de santé enquêtées',
                value: formatNumber(row?.nb_zones ?? null),
                description: "Nombre de zones de santé couvertes par l'enquête ECV pour la sélection courante.",
            },
            {
                key: 'penta_cov',
                label: 'Couverture Penta',
                value: formatPercent(row?.penta_cov ?? null),
                description: "Couverture vaccinale pentavalente mesurée par l'enquête ECV.",
            },
            {
                key: 'zdc_cov',
                label: 'Enfants zéro dose',
                value: formatPercent(row?.zdc_cov ?? null),
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
                    <IndicatorCardECV key={c.key} label={c.label} value={c.value} description={c.description} />
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
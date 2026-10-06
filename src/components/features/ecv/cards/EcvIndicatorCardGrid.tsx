import { useMemo } from 'react'
import { EcvIndicatorCard } from './EcvIndicatorCard'
import { useKeyEcvData } from '@/hooks'
import { formatCi, formatPercent } from '@/lib/utils/ecvFormat'

const formatNumber = (v: number | null): string => (v == null ? '—' : Math.round(v).toLocaleString())
// ISO "2023-03-02" -> "2 mars 2023". Parsed as UTC and formatted in UTC so the
// viewer's timezone cannot shift the day.
const formatDate = (iso: string | null): string =>
    iso == null
        ? '—'
        : new Date(`${iso}T00:00:00Z`).toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
        })

export function EcvIndicatorCardGrid() {
    const row = useKeyEcvData()

    const cards = useMemo(
        () => [
            {
                key: 'survey_dates',
                label: "Dates de l'enquête",
                value: [`Du ${formatDate(row?.survey_start ?? null)}`, `au ${formatDate(row?.survey_end ?? null)}`],
                confidenceInterval: undefined,
                description: "Premier et dernier jour de collecte de l'enquête ECV pour la sélection courante (province, zone), d'après la date des entretiens.",
            },
            {
                key: 'nb_people',
                label: 'Enfants enquêtés',
                value: formatNumber(row?.nb_people ?? null),
                confidenceInterval: undefined,
                description: "Nombre d'enfants âgés de 6 à 24 mois couverts par l'enquête ECV pour la sélection courante (année, milieu, province, zone).",
            },
            {
                key: 'nb_zones',
                label: row?.level === 'zone' ? 'Aires de santé enquêtées' : 'Zones de santé enquêtées',
                value:
                    row?.level === 'zone'
                        ? formatNumber(row.nb_areas ?? null)
                        : formatNumber(row?.nb_zones ?? null),
                confidenceInterval: undefined,
                description: "Nombre de zones de santé couvertes par l'enquête ECV pour la sélection courante.",
                subtext:
                    row?.nb_areas != null && row.nb_areas_tot != null
                        ? `${formatNumber(row.nb_areas)} / ${formatNumber(row.nb_areas_tot)} aires de santé enquêtées`
                        : row?.nb_areas != null
                            ? `${formatNumber(row.nb_areas)} aires de santé enquêtées`
                            : undefined,
            },
            {
                key: 'penta_cov',
                label: 'Couverture Penta',
                value: formatPercent(row?.penta_cov ?? null),
                confidenceInterval: formatCi(row?.penta_cov ?? null, row?.penta_cov_low ?? null, row?.penta_cov_high ?? null),
                description: "Couverture vaccinale pentavalente mesurée par l'enquête ECV (3 doses).",
            },
            {
                key: 'zdc_cov',
                label: 'Enfants zéro dose',
                value: formatPercent(row?.zdc_cov ?? null),
                confidenceInterval: formatCi(row?.zdc_cov ?? null, row?.zdc_cov_low ?? null, row?.zdc_cov_high ?? null),
                description: "Proportion d'enfants zéro dose mesurée par l'enquête ECV (aucune dose d'aucun vaccin).",
            },
        ],
        [row]
    )

    return (
        <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-700">Chiffres clés ECV</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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
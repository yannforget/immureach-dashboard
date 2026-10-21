import { useMemo } from 'react'
import { useCounterfactuals } from '@/hooks'
import { useDashboardStore } from '@/store/dashboardStore'
import { buildSegmentBarOptions } from '@/lib/charts/counterfactualOptions'
import type { CounterfactualSegment } from '@/lib/utils/counterfactuals'
import { ActionChartPanel } from './ActionChartPanel'

export function SegmentChart() {
  const data = useCounterfactuals()
  const selectedSegment = useDashboardStore(s => s.selectedSegment)
  const setSelectedSegment = useDashboardStore(s => s.setSelectedSegment)

  const options = useMemo(
    () =>
      data
        ? buildSegmentBarOptions({
            rows: data.byProvince,
            selectedSegment,
            scopeLabel: data.scope.label,
          })
        : null,
    [data, selectedSegment],
  )

  const onEvents = useMemo(
    () => ({
      click: (p: any) => {
        const segment = p.seriesId as CounterfactualSegment
        setSelectedSegment(segment === selectedSegment ? null : segment)
      },
    }),
    [selectedSegment, setSelectedSegment],
  )

  return (
    <ActionChartPanel
      title="Quelle approche atteint quels enfants ?"
      info={`Pour chaque enfant zéro-dose, le modèle ménage simule deux scénarios : améliorer son accès aux services (offre) ou ses facteurs individuels (demande). Un enfant est « atteint » si sa probabilité d'être vacciné dépasse le seuil de vaccination (${data ? Math.round(data.threshold * 100) : '—'} %) après changement. Cliquez sur un segment pour filtrer les leviers et le nuage de points.`}
      subtitle="Répartition des enfants zéro-dose selon le scénario qui les fait passer le seuil."
      options={options}
      filename="actions-segments"
      onEvents={onEvents}
    />
  )
}

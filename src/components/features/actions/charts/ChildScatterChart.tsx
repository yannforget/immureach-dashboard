import { useMemo } from 'react'
import { useCounterfactuals } from '@/hooks'
import { useDashboardStore } from '@/store/dashboardStore'
import { buildChildScatterOptions } from '@/lib/charts/counterfactualOptions'
import type { CounterfactualChild } from '@/lib/utils/counterfactuals'
import { ActionChartPanel } from './ActionChartPanel'

export function ChildScatterChart() {
  const data = useCounterfactuals()
  const selectedSegment = useDashboardStore(s => s.selectedSegment)
  const setSelectedSegment = useDashboardStore(s => s.setSelectedSegment)

  const options = useMemo(
    () => (data ? buildChildScatterOptions({ children: data.children, selectedSegment, threshold: data.threshold }) : null),
    [data, selectedSegment],
  )

  const onEvents = useMemo(
    () => ({
      click: (p: any) => {
        const child = p.data?.child as CounterfactualChild | undefined
        if (!child) return
        setSelectedSegment(child.segment === selectedSegment ? null : child.segment)
      },
    }),
    [selectedSegment, setSelectedSegment],
  )

  return (
    <ActionChartPanel
      title="Enfants zéro-dose, un point par enfant"
      info="Chaque point est un enfant zéro-dose : en abscisse sa probabilité d'être vacciné si l'on améliore son accès aux services, en ordonnée si l'on agit sur ses facteurs individuels. Les lignes pointillées marquent le seuil de vaccination et délimitent les quatre groupes. Cliquez sur un point pour filtrer son groupe."
      subtitle={data ? `${data.scope.label} · ${data.children.length} enfants` : undefined}
      options={options}
      filename="actions-enfants"
      onEvents={onEvents}
    />
  )
}

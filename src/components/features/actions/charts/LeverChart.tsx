import { useMemo } from 'react'
import { X } from 'lucide-react'
import { CATEGORY_COLORS, CATEGORY_LABELS, useCounterfactuals } from '@/hooks'
import { useDashboardStore } from '@/store/dashboardStore'
import { buildLeverBarOptions } from '@/lib/charts/counterfactualOptions'
import { SCENARIO_LABELS, SEGMENT_LABELS } from '@/lib/utils/counterfactuals'
import { CF_SCENARIO_COLORS, CF_SEGMENT_COLORS } from '@/lib/charts/theme'
import type { CounterfactualScenario } from '@/types'

const SCENARIO_ORDER: CounterfactualScenario[] = ['hcs', 'indiv']
import { ActionChartPanel } from './ActionChartPanel'

export function LeverChart() {
  const data = useCounterfactuals()
  const selectedSegment = useDashboardStore(s => s.selectedSegment)
  const setSelectedSegment = useDashboardStore(s => s.setSelectedSegment)

  const options = useMemo(
    () => (data ? buildLeverBarOptions({ levers: data.levers, categoryColors: CATEGORY_COLORS, categoryLabels: CATEGORY_LABELS }) : null),
    [data],
  )

  const subtitle = (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span>Part des enfants dont la caractéristique a dû changer.</span>
      {SCENARIO_ORDER.map(s => (
        <span key={s} className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: CF_SCENARIO_COLORS[s] }} />
          {SCENARIO_LABELS[s]}
        </span>
      ))}
    </span>
  )

  const filterChip = selectedSegment && (
    <button
      type="button"
      onClick={() => setSelectedSegment(null)}
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
      style={{ borderColor: CF_SEGMENT_COLORS[selectedSegment], color: CF_SEGMENT_COLORS[selectedSegment] }}
      aria-label="Retirer le filtre"
    >
      {SEGMENT_LABELS[selectedSegment]}
      <X className="h-3 w-3" />
    </button>
  )

  return (
    <ActionChartPanel
      title="Leviers à actionner"
      info="Pour chaque caractéristique, part des enfants pour lesquels le scénario a dû la modifier. La couleur du nom et de la barre indique le scénario (bleu : système sanitaire, violet : facteurs individuels) ; la composante COM-B est donnée au survol. Le survol donne aussi le changement médian appliqué, dans l'unité de la variable."
      subtitle={subtitle}
      options={options}
      filename="actions-leviers"
      actions={filterChip}
    />
  )
}

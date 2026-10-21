import { useMemo } from 'react'
import { X } from 'lucide-react'
import { CATEGORY_COLORS, CATEGORY_LABELS, CATEGORY_ORDER, useCounterfactuals } from '@/hooks'
import { useDashboardStore } from '@/store/dashboardStore'
import { buildLeverBarOptions } from '@/lib/charts/counterfactualOptions'
import { SEGMENT_LABELS } from '@/lib/utils/counterfactuals'
import { CF_SEGMENT_COLORS } from '@/lib/charts/theme'
import { ActionChartPanel } from './ActionChartPanel'

export function LeverChart() {
  const data = useCounterfactuals()
  const selectedSegment = useDashboardStore(s => s.selectedSegment)
  const setSelectedSegment = useDashboardStore(s => s.setSelectedSegment)

  const options = useMemo(
    () => (data ? buildLeverBarOptions({ levers: data.levers, categoryColors: CATEGORY_COLORS }) : null),
    [data],
  )

  const subtitle = (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span>Part des enfants dont la caractéristique a dû changer.</span>
      {CATEGORY_ORDER.map(c => (
        <span key={c} className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[c] }} />
          {CATEGORY_LABELS[c]}
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
      info="Pour chaque caractéristique, part des enfants pour lesquels le scénario a dû la modifier. La couleur du nom indique le scénario (bleu : accès aux services, violet : facteurs individuels) ; la couleur de la barre, la composante COM-B. Le survol donne le changement médian appliqué, dans l'unité de la variable."
      subtitle={subtitle}
      options={options}
      filename="actions-leviers"
      actions={filterChip}
    />
  )
}

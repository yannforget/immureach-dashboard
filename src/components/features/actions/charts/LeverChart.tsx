import { useMemo } from 'react'
import { CATEGORY_COLORS, CATEGORY_LABELS, useCounterfactuals } from '@/hooks'
import { buildLeverBarOptions } from '@/lib/charts/counterfactualOptions'
import { SCENARIO_LABELS } from '@/lib/utils/counterfactuals'
import { CF_SCENARIO_COLORS } from '@/lib/charts/theme'
import type { CounterfactualScenario } from '@/types'

const SCENARIO_ORDER: CounterfactualScenario[] = ['hcs', 'indiv']
import { ActionChartPanel } from './ActionChartPanel'

export function LeverChart() {
  const data = useCounterfactuals()

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

  return (
    <ActionChartPanel
      title="Leviers à actionner"
      info="Pour chaque caractéristique, part des enfants pour lesquels le scénario a dû la modifier. La couleur du nom et de la barre indique le scénario (bleu : système sanitaire, violet : facteurs individuels) ; la composante COM-B est donnée au survol. Le survol donne aussi le changement médian appliqué, dans l'unité de la variable."
      subtitle={subtitle}
      options={options}
      filename="actions-leviers"
    />
  )
}

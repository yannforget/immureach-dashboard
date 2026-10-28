import { useMemo } from 'react'
import { useCounterfactuals } from '@/hooks'
import { buildProbabilityShiftOptions } from '@/lib/charts/counterfactualOptions'
import { ActionChartPanel } from './ActionChartPanel'

export function ProbabilityShiftChart() {
  const data = useCounterfactuals()

  const options = useMemo(() => (data ? buildProbabilityShiftOptions(data.byProvince) : null), [data])

  return (
    <ActionChartPanel
      title="Gain de probabilité de vaccination"
      info="Probabilité moyenne qu'un enfant zéro-dose reçoive au moins une dose, avec ses caractéristiques actuelles (gris) puis après changement des caractéristiques du scénario. Le survol donne le gain moyen en points de pourcentage."
      subtitle="Probabilité moyenne actuelle → après changement, par scénario."
      options={options}
      filename="actions-gain-probabilite"
    />
  )
}

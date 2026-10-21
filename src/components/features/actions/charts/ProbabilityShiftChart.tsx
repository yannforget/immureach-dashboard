import { useMemo } from 'react'
import { useCounterfactuals } from '@/hooks'
import { buildProbabilityShiftOptions } from '@/lib/charts/counterfactualOptions'
import { ActionChartPanel } from './ActionChartPanel'

const pct = (v: number | undefined) => (v == null ? '—' : `${Math.round(v * 100)} %`)

export function ProbabilityShiftChart() {
  const data = useCounterfactuals()

  const options = useMemo(() => (data ? buildProbabilityShiftOptions(data.byProvince, data.threshold) : null), [data])

  return (
    <ActionChartPanel
      title="Gain de probabilité de vaccination"
      info={`Probabilité moyenne qu'un enfant zéro-dose reçoive au moins une dose, avec ses caractéristiques actuelles (gris) puis après changement des caractéristiques du scénario. La ligne pointillée marque le seuil de ${pct(data?.threshold)} au-delà duquel un enfant est considéré comme atteint.`}
      subtitle="Probabilité moyenne actuelle → après changement, par scénario."
      options={options}
      filename="actions-gain-probabilite"
    />
  )
}

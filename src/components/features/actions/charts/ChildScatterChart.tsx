import { useMemo, useState } from 'react'
import { useCounterfactuals } from '@/hooks'
import { buildChildScatterOptions } from '@/lib/charts/counterfactualOptions'
import { ActionChartPanel } from './ActionChartPanel'

export function ChildScatterChart() {
  const data = useCounterfactuals()
  // Province shown by this chart only; null for every covered province.
  const [province, setProvince] = useState<string | null>(null)

  const children = useMemo(
    () => (data ? (province ? data.children.filter(c => c.province === province) : data.children) : []),
    [data, province],
  )

  const options = useMemo(
    () => (data ? buildChildScatterOptions({ children }) : null),
    [data, children],
  )

  const provinceFilter = data && data.provinces.length > 1 && (
    <select
      value={province ?? ''}
      onChange={e => setProvince(e.target.value || null)}
      aria-label="Province"
      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
    >
      <option value="">Toutes les provinces</option>
      {data.provinces.map(p => (
        <option key={p} value={p}>
          {p}
        </option>
      ))}
    </select>
  )

  return (
    <ActionChartPanel
      title="Enfants zéro-dose, un point par enfant"
      info="Chaque point est un enfant zéro-dose : en abscisse sa probabilité d'être vacciné si l'on améliore son accès aux services, en ordonnée si l'on agit sur ses facteurs individuels. La diagonale pointillée marque un gain égal : au-dessus (violet), les facteurs individuels augmentent davantage la probabilité ; en dessous (bleu), le système sanitaire. Le menu filtre par province."
      subtitle={data ? `${province ?? data.scope.label} · ${children.length} enfants` : undefined}
      options={options}
      filename={province ? `actions-enfants-${province}` : 'actions-enfants'}
      actions={provinceFilter}
    />
  )
}

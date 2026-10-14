import { useCallback, useMemo, useRef } from 'react'
import EChartsReact from 'echarts-for-react'
import { useRelativeInfluence } from '@/hooks'
import { InfoBubble } from '@/components/common/InfoBubble'
import { buildRiTreemapOptions } from '@/lib/charts/riTreemapOptions'

export function RelativeInfluenceTreemap() {
  const { categories } = useRelativeInfluence()
  const chartRef = useRef<EChartsReact>(null)

  // Tile size of a treemap node once laid out, so labels too long for their
  // tile can be hidden. getModel() is internal to ECharts, hence the cast.
  const getItemSize = useCallback((dataIndex: number) => {
    const chart = chartRef.current?.getEchartsInstance() as any
    return chart?.getModel()?.getSeriesByIndex(0)?.getData()?.getItemLayout(dataIndex)
  }, [])

  const options = useMemo(
    () => (categories.length > 0 ? buildRiTreemapOptions({ categories, getItemSize }) : null),
    [categories, getItemSize],
  )

  const top = categories[0]

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-700">Poids des composantes COM-B (échelle nationale)</h3>
          <InfoBubble text="Part du pouvoir prédictif du modèle ménage attribuée à chaque variable (total = 100 %). Elle indique l'importance d'un déterminant, pas le sens de son effet sur la vaccination." />
        </div>
        <p className="text-xs text-slate-500">
          {top
            ? "Cliquer sur une composante pour l'agrandir."
            : "Part de l'influence totale par composante."}
        </p>
      </div>
      {options ? (
        <div className="min-h-0 flex-1">
          <EChartsReact
            ref={chartRef}
            option={options}
            theme="dashboard"
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      ) : (
        <div className="flex h-64 items-center justify-center bg-slate-50 text-sm text-slate-500">
          Influences relatives indisponibles.
        </div>
      )}
    </div>
  )
}

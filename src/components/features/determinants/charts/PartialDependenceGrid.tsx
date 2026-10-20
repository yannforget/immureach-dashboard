import { useEffect, useMemo, useRef } from 'react'
import EChartsReact from 'echarts-for-react'
import { usePartialDependence, useSelectedPdpItem } from '@/hooks'
import { useDashboardStore } from '@/store/dashboardStore'
import { InfoBubble } from '@/components/common/InfoBubble'
import { buildPdpGridOptions } from '@/lib/charts/pdpOptions'

// Most influential variables shown as small multiples.
const GRID_SIZE = 12
const COLUMNS = 3
const ROW_HEIGHT = 110
// Control variables left out of the overview (still in the detail chart).
const GRID_EXCLUDED = new Set(['ethnic_group'])

export function PartialDependenceGrid() {
  const items = usePartialDependence()
  const selected = useSelectedPdpItem(items)
  const setSelectedRiVariable = useDashboardStore(s => s.setSelectedRiVariable)
  const chartRef = useRef<EChartsReact>(null)

  const shown = useMemo(() => items.filter(i => !GRID_EXCLUDED.has(i.variable)).slice(0, GRID_SIZE), [items])
  const rows = Math.ceil(shown.length / COLUMNS)

  const options = useMemo(
    () => (shown.length > 0
      ? buildPdpGridOptions({ items: shown, selected: selected?.variable ?? null, columns: COLUMNS, rowHeight: ROW_HEIGHT })
      : null),
    [shown, selected],
  )

  // Clicking anywhere inside a panel (not only on its line) selects its
  // variable for the detail chart.
  useEffect(() => {
    const chart = chartRef.current?.getEchartsInstance()
    if (!chart || shown.length === 0) return
    const zr = chart.getZr()
    const onClick = (e: { offsetX: number; offsetY: number }) => {
      const index = shown.findIndex((_, i) => chart.containPixel({ gridIndex: i }, [e.offsetX, e.offsetY]))
      if (index >= 0) setSelectedRiVariable(shown[index].variable)
    }
    zr.on('click', onClick)
    return () => {
      zr.off('click', onClick)
    }
  }, [shown, options, setSelectedRiVariable])

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-700">Effets des {shown.length} déterminants les plus influents</h3>
          <InfoBubble text="Courbe moyenne de chaque déterminant, sur une même échelle : une courbe plate signifie peu d'effet, une courbe qui monte un effet favorable à la vaccination quand le déterminant augmente, une courbe qui descend un effet défavorable." />
        </div>
        <p className="text-xs text-slate-500">Cliquer sur un graphique pour l'afficher en détail.</p>
      </div>
      {options ? (
        <div className="cursor-pointer px-2 pt-3">
          <EChartsReact
            ref={chartRef}
            option={options}
            notMerge
            theme="dashboard"
            style={{ width: '100%', height: rows * ROW_HEIGHT }}
          />
        </div>
      ) : (
        <div className="flex h-64 items-center justify-center bg-slate-50 text-sm text-slate-500">
          Courbes de dépendance partielle indisponibles.
        </div>
      )}
    </div>
  )
}

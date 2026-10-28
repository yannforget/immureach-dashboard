import { useCallback, useMemo, useRef, useState } from 'react'
import EChartsReact from 'echarts-for-react'
import { ChevronDown, Download } from 'lucide-react'
import { useRelativeInfluence } from '@/hooks'
import { useDashboardStore } from '@/store/dashboardStore'
import { InfoBubble } from '@/components/common/InfoBubble'
import { buildRiTreemapOptions } from '@/lib/charts/riTreemapOptions'
import { downloadDataUrl } from '@/lib/utils/download'
import { Button } from '@/components/ui/button'

export function RelativeInfluenceTreemap() {
  const { categories } = useRelativeInfluence()
  const chartRef = useRef<EChartsReact>(null)
  const [downloadOpen, setDownloadOpen] = useState(false)
  const setSelectedRiVariable = useDashboardStore(s => s.setSelectedRiVariable)

  // Clicking a variable tile shows its effect curve below the treemap;
  // clicking a category tile keeps zooming into it.
  const onEvents = useMemo(
    () => ({
      click: (params: any) => {
        if (params.data?.variable) setSelectedRiVariable(params.data.variable)
      },
    }),
    [setSelectedRiVariable],
  )

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

  // Exports the treemap as currently shown, including a zoomed-in component.
  const handleDownloadPng = () => {
    const chart = chartRef.current?.getEchartsInstance()
    if (!chart) return
    const url = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' })
    downloadDataUrl(url, 'poids-composantes-com-b-national.png')
    setDownloadOpen(false)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-700">Poids des composantes COM-B (échelle nationale)</h3>
            <InfoBubble text="Part du pouvoir prédictif du modèle ménage attribuée à chaque variable (total = 100 %). Elle indique l'importance d'un déterminant, pas le sens de son effet sur la vaccination." />
          </div>
          <p className="text-xs text-slate-500">
            {top
              ? "Cliquer sur une composante pour l'agrandir, sur une variable pour voir son effet ci-dessous."
              : "Part de l'influence totale par composante."}
          </p>
        </div>
        <div className="relative flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs text-slate-600"
            disabled={!options}
            aria-haspopup="menu"
            aria-expanded={downloadOpen}
            onClick={() => setDownloadOpen(o => !o)}
          >
            <Download className="h-3.5 w-3.5" />
            Télécharger
            <ChevronDown className={`h-3 w-3 transition-transform ${downloadOpen ? 'rotate-180' : ''}`} />
          </Button>
          {downloadOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setDownloadOpen(false)} />
              <div className="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                <button
                  type="button"
                  onClick={handleDownloadPng}
                  className="flex w-full items-center px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-100"
                >
                  Graphique (PNG)
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      {options ? (
        <div className="min-h-0 flex-1">
          <EChartsReact
            ref={chartRef}
            option={options}
            onEvents={onEvents}
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

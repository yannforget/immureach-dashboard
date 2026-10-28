import { useMemo, useRef, useState } from 'react'
import EChartsReact from 'echarts-for-react'
import { ChevronDown, Download } from 'lucide-react'
import { usePartialDependence, useSelectedPdpItem } from '@/hooks'
import { useDashboardStore } from '@/store/dashboardStore'
import { InfoBubble } from '@/components/common/InfoBubble'
import { buildPdpOptions } from '@/lib/charts/pdpOptions'
import { formatPdpShare } from '@/lib/utils/partialDependence'
import { downloadDataUrl } from '@/lib/utils/download'
import { Button } from '@/components/ui/button'

export function PartialDependenceChart() {
  const items = usePartialDependence()
  const item = useSelectedPdpItem(items)
  const setSelectedRiVariable = useDashboardStore(s => s.setSelectedRiVariable)
  const chartRef = useRef<EChartsReact>(null)
  const [downloadOpen, setDownloadOpen] = useState(false)

  const options = useMemo(() => (item ? buildPdpOptions({ item }) : null), [item])

  const from = item?.mean[0]?.[1]
  const to = item?.mean[item.mean.length - 1]?.[1]

  const handleDownloadPng = () => {
    const chart = chartRef.current?.getEchartsInstance()
    if (!chart || !item) return
    const url = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' })
    downloadDataUrl(url, `effet-${item.variable}-national.png`)
    setDownloadOpen(false)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-700">Effet d'un déterminant sur la vaccination</h3>
            <InfoBubble text="Courbe de dépendance partielle : part d'enfants non zéro-dose (au moins une dose) prédite par le modèle ménage selon la valeur du déterminant, les autres variables restant inchangées. La courbe est la moyenne de 5 exécutions du modèle." />
          </div>
          <p className="text-xs text-slate-500">
            {item && from != null && to != null
              ? `Du niveau le plus faible au plus élevé : ${formatPdpShare(from)} → ${formatPdpShare(to)} d'enfants non zéro-dose.`
              : 'Sens et forme de l\'effet de chaque déterminant.'}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <div className="relative">
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
          {items.length > 0 && (
            <select
              value={item?.variable ?? ''}
              onChange={e => setSelectedRiVariable(e.target.value)}
              aria-label="Déterminant"
              className="max-w-56 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              {items.map(i => (
                <option key={i.variable} value={i.variable}>
                  {i.label}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      {options ? (
        <div className="min-h-0 flex-1">
          <EChartsReact
            ref={chartRef}
            option={options}
            notMerge
            theme="dashboard"
            style={{ width: '100%', height: '100%' }}
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

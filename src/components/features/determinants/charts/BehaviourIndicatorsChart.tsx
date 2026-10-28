import { useMemo, useRef, useState } from 'react'
import EChartsReact from 'echarts-for-react'
import { ChevronDown, Download } from 'lucide-react'
import { useDashboardStore } from '@/store/dashboardStore'
import { useIndicatorComparison } from '@/hooks'
import { buildDumbbellOptions } from '@/lib/charts/dumbbellOptions'
import { buildBehaviourIndicatorsCsv, buildScopeSlug, downloadDataUrl, downloadText } from '@/lib/utils/download'
import { Button } from '@/components/ui/button'

export function BehaviourIndicatorsChart() {
  const chartRef = useRef<EChartsReact>(null)
  const comparison = useIndicatorComparison()
  const selectedYear = useDashboardStore(s => s.selectedYear)
  const [downloadOpen, setDownloadOpen] = useState(false)

  const options = useMemo(() => {
    if (!comparison || comparison.items.length === 0) return null
    return buildDumbbellOptions({ items: comparison.items })
  }, [comparison])

  if (!comparison || !options || comparison.items.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-700">
            Behaviour indicators
          </h3>
        </div>
        <div className="flex h-64 items-center justify-center bg-slate-50 text-sm text-slate-500">
          No survey indicators for this selection.
        </div>
      </div>
    )
  }

  // Slug from the level the data actually comes from, so a fallback is not
  // mislabelled as the requested zone.
  const scopeSlug = buildScopeSlug(
    comparison.scopeLevel === 'province' ? comparison.scopeLabel : null,
    comparison.scopeLevel === 'zone' ? comparison.scopeLabel : null,
  )
  const baseFilename = `indicateurs-comportementaux-${scopeSlug}-${selectedYear}`

  const handleDownloadPng = () => {
    const chart = chartRef.current?.getEchartsInstance()
    if (!chart) return
    const url = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' })
    downloadDataUrl(url, `${baseFilename}.png`)
    setDownloadOpen(false)
  }

  const handleDownloadCsv = () => {
    downloadText(buildBehaviourIndicatorsCsv(comparison, selectedYear), `${baseFilename}.csv`, 'text/csv')
    setDownloadOpen(false)
  }

  // Dynamic height so 14 indicators don't squeeze into a fixed box.
  const rowPx = 32
  const overheadPx = 96
  const chartHeight = comparison.items.length * rowPx + overheadPx

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">
            Indicateurs comportementaux · {comparison.scopeLabel}
          </h3>
          <p className="text-xs text-slate-500">
            Enfants non vaccinés vs enfants vaccinés, classés par valeur décroissante chez les vaccinés (sur une échelle de 0 à 1)
            {comparison.scopeLevel !== comparison.requestedLevel && (
              <span className="ml-1 text-amber-600">· données {comparison.scopeLevel === 'province' ? 'provinciales' : 'nationales'} affichées (pas de données pour cette sélection)</span>
            )}
          </p>
        </div>
        <div className="relative flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs text-slate-600"
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
                <button
                  type="button"
                  onClick={handleDownloadCsv}
                  className="flex w-full items-center px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-100"
                >
                  Données (CSV)
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <div style={{ height: chartHeight }}>
        <EChartsReact
          ref={chartRef}
          option={options}
          theme="dashboard"
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  )
}

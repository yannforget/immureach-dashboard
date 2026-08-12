import React, { useMemo, useRef, useState } from 'react'
import EChartsReact from 'echarts-for-react'
import { ChevronDown, Download } from 'lucide-react'
import { useDashboardStore } from '@/store/dashboardStore'
import { useData } from '@/context/DataContext'
import { useEcvEvolutionLineData, useZoneData } from '@/hooks'
import { ECV_LINE_METRIC_KEYS, ECV_METRIC_META } from '@/lib/utils/constants'
import { buildEcvEvolutionLineOptions } from '@/lib/charts/ecvLineOptions'
import { buildEcvEvolutionCsv, buildScopeSlug, downloadDataUrl, downloadText } from '@/lib/utils/download'
import { Button } from '@/components/ui/button'
import type { EcvMetricKey } from '@/types'

export function EcvEvolutionLineChart() {
  const chartRef = useRef<EChartsReact>(null)
  const { loading, error, ecvVaccCov } = useData()
  const selectedProvince = useDashboardStore(s => s.selectedProvince)
  const selectedZoneId = useDashboardStore(s => s.selectedZoneId)
  const selectedYear = useDashboardStore(s => s.selectedYear)

  // Multi-select state lives here — no other component reads it.
  const [selectedKeys, setSelectedKeys] = useState<EcvMetricKey[]>(['zero_dose'])

  const data = useEcvEvolutionLineData(selectedKeys)

  const [downloadOpen, setDownloadOpen] = useState(false)
  const zones = useZoneData(selectedProvince)
  const zoneName = selectedZoneId
    ? zones.find(z => z.id === selectedZoneId)?.displayName ?? null
    : null

  const toggleKey = (key: EcvMetricKey) => {
    setSelectedKeys(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key],
    )
  }

  const scopeLabel = selectedZoneId ? 'zone sélectionnée' : selectedProvince ?? 'national'

  const baseFilename = `ecv-evolution-${buildScopeSlug(selectedProvince, zoneName)}-${selectedYear}`
  const downloadDisabled = data.series.length === 0

  const options = useMemo(
    () =>
      buildEcvEvolutionLineOptions({
        years: data.years,
        series: data.series,
        selectedYear,
        scopeLabel,
      }),
    [data, selectedYear, scopeLabel],
  )

  const handleDownloadPng = () => {
    const chart = chartRef.current?.getEchartsInstance()
    if (!chart) return
    const url = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' })
    downloadDataUrl(url, `${baseFilename}.png`)
    setDownloadOpen(false)
  }

  const handleDownloadCsv = () => {
    downloadText(
      buildEcvEvolutionCsv(
        data,
        { province: selectedProvince, zone: zoneName },
        ecvVaccCov,
        zones,
      ),
      `${baseFilename}.csv`,
      'text/csv',
    )
    setDownloadOpen(false)
  }

  if (loading || error) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50">
        <div className="text-center">
          {loading && (
            <>
              <div className="inline-block animate-spin rounded-full border-4 border-slate-200 border-t-teal-600 h-12 w-12"></div>
              <p className="mt-4 text-sm text-slate-500">Chargement du graphique...</p>
            </>
          )}
          {error && <p className="text-sm text-red-600">Erreur: {error.message}</p>}
        </div>
      </div>
    )
  }

  const emptyMessage =
    selectedKeys.length === 0
      ? 'Sélectionnez au moins une variable'
      : 'Aucune donnée ECV pour cette sélection'

  return (
    <div className="flex flex-col h-full relative">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-700">
          Évolution de la couverture — Enquête ECV{' '}
          <span className="font-normal text-slate-400">({scopeLabel})</span>
        </h3>
        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs text-slate-600"
            disabled={downloadDisabled}
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
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 relative">
          {data.series.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              {emptyMessage}
            </div>
          ) : (
            <EChartsReact
              ref={chartRef}
              option={options}
              theme="dashboard"
              style={{ width: '100%', height: '100%' }}
              notMerge
              key={`ecv-line-${selectedProvince}-${selectedZoneId}`}
            />
          )}
        </div>

        {/* Variable selector */}
        <div className="flex w-44 flex-shrink-0 flex-col border-l border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <span className="text-xs font-semibold text-slate-700">Variables</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedKeys([...ECV_LINE_METRIC_KEYS])}
                className="text-[10px] font-medium text-teal-700 hover:text-teal-900"
              >
                Toutes
              </button>
              <button
                type="button"
                onClick={() => setSelectedKeys([])}
                className="text-[10px] font-medium text-slate-400 hover:text-slate-600"
              >
                Aucune
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2">
            {ECV_LINE_METRIC_KEYS.map(key => (
              <label key={key} className="flex cursor-pointer items-center gap-2 py-1">
                <input
                  type="checkbox"
                  checked={selectedKeys.includes(key)}
                  onChange={() => toggleKey(key)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-xs text-slate-600">{ECV_METRIC_META[key].label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

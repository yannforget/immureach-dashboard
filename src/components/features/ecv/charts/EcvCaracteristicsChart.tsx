import React, { useEffect, useMemo, useRef, useState } from 'react'
import EChartsReact from 'echarts-for-react'
import { ChevronDown, ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { useDashboardStore } from '@/store/dashboardStore'
import { useData } from '@/context/DataContext'
import { useEcvCaracteristicsData, useZoneData } from '@/hooks'
import { buildEcvCaracteristicsOptions } from '@/lib/charts/ecvCaracteristicsOptions'
import { buildEcvCaracteristicsCsv, buildScopeSlug, downloadDataUrl, downloadText } from '@/lib/utils/download'
import { Button } from '@/components/ui/button'

export function EcvCaracteristicsChart() {
  const chartRef = useRef<EChartsReact>(null)
  const { loading } = useData()
  const selectedProvince = useDashboardStore(s => s.selectedProvince)
  const selectedZoneId = useDashboardStore(s => s.selectedZoneId)
  const selectedYear = useDashboardStore(s => s.selectedYear)

  const { groups, areas } = useEcvCaracteristicsData()
  const groupsKey = groups.map(g => g.key).join('|')

  const [groupIndex, setGroupIndex] = useState(0)
  useEffect(() => {
    setGroupIndex(0)
  }, [groupsKey])

  const activeGroup = groups[Math.min(groupIndex, Math.max(groups.length - 1, 0))]

  const options = useMemo(
    () => (activeGroup && areas.length > 0 ? buildEcvCaracteristicsOptions({ group: activeGroup, areas }) : {}),
    [activeGroup, areas],
  )

  const [downloadOpen, setDownloadOpen] = useState(false)
  const zones = useZoneData(selectedProvince)
  const zoneName = selectedZoneId
    ? zones.find(z => z.id === selectedZoneId)?.displayName ?? null
    : null

  const scopeLabelDisplay = selectedZoneId ? 'zone sélectionnée' : selectedProvince ?? 'national'

  const baseFilename = activeGroup
    ? `ecv-caracteristiques-${activeGroup.key}-${buildScopeSlug(selectedProvince, zoneName)}-${selectedYear}`
    : `ecv-caracteristiques-${buildScopeSlug(selectedProvince, zoneName)}-${selectedYear}`
  const downloadDisabled = !activeGroup || areas.length === 0

  // const handleDownloadPng = () => {
  //   const chart = chartRef.current?.getEchartsInstance()
  //   if (!chart) return
  //   const url = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' })
  //   downloadDataUrl(url, `${baseFilename}.png`)
  //   setDownloadOpen(false)
  // }

  const handleDownloadCsv = () => {
    if (!activeGroup) return
    downloadText(
      buildEcvCaracteristicsCsv(activeGroup, areas),
      `${baseFilename}.csv`,
      'text/csv',
    )
    setDownloadOpen(false)
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-700">Caractéristiques — Enquête ECV</h3>
        </div>
        <div className="flex flex-1 items-center justify-center bg-slate-50">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full border-4 border-slate-200 border-t-teal-600 h-12 w-12"></div>
            <p className="mt-4 text-sm text-slate-500">Chargement du graphique...</p>
          </div>
        </div>
      </div>
    )
  }

  const hasTabs = groups.length > 1

  return (
    <div className="flex flex-col h-full relative">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-700">
          Caractéristiques ménages — Enquête ECV{' '}
          <span className="font-normal text-slate-400">({scopeLabelDisplay})</span>
        </h3>
        <div className="flex items-center gap-2">
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
                  {/* <button
                    type="button"
                    onClick={handleDownloadPng}
                    className="flex w-full items-center px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-100"
                  >
                    Graphique (PNG)
                  </button> */}
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
          {hasTabs && (
            <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1 py-0.5">
              <button
                type="button"
                onClick={() => setGroupIndex(i => (i - 1 + groups.length) % groups.length)}
                aria-label="Variable précédente"
                className="flex h-5 w-5 items-center justify-center rounded text-slate-600 hover:bg-slate-200"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-24 px-1 text-center text-xs font-medium text-slate-700">
                {activeGroup?.label ?? '—'}
              </span>
              <button
                type="button"
                onClick={() => setGroupIndex(i => (i + 1) % groups.length)}
                aria-label="Variable suivante"
                className="flex h-5 w-5 items-center justify-center rounded text-slate-600 hover:bg-slate-200"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="flex-1 relative">
        {!activeGroup || areas.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            Aucune donnée ECV pour cette sélection
          </div>
        ) : (
          <EChartsReact
            ref={chartRef}
            option={options}
            theme="dashboard"
            style={{ width: '100%', height: '100%' }}
            key={`ecv-caracteristics-${activeGroup.key}-${selectedProvince}-${selectedZoneId}`}
          />
        )}
      </div>
    </div>
  )
}

import React, { useEffect, useMemo, useRef, useState } from 'react'
import EChartsReact from 'echarts-for-react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useDashboardStore } from '@/store/dashboardStore'
import { useData } from '@/context/DataContext'
import { useEcvCaracteristicsData } from '@/hooks'
import { buildEcvCaracteristicsOptions } from '@/lib/charts/ecvCaracteristicsOptions'

export function EcvCaracteristicsChart() {
  const chartRef = useRef<EChartsReact>(null)
  const { loading } = useData()
  const selectedProvince = useDashboardStore(s => s.selectedProvince)
  const selectedZoneId = useDashboardStore(s => s.selectedZoneId)

  const { groups, areas, scopeLabel } = useEcvCaracteristicsData()
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

  const scopeLabelDisplay = selectedZoneId ? 'zone sélectionnée' : selectedProvince ?? 'national'

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

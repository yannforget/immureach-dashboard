import React, { useMemo, useRef, useState } from 'react'
import EChartsReact from 'echarts-for-react'
import { useDashboardStore } from '@/store/dashboardStore'
import { useData } from '@/context/DataContext'
import { useEcvEvolutionLineData } from '@/hooks/ecv/useEcvEvolutionLineData'
import { ECV_LINE_METRIC_KEYS, ECV_METRIC_META } from '@/lib/utils/constants'
import { buildEcvEvolutionLineOptions } from '@/lib/charts/ecvLineOptions'
import type { EcvMetricKey } from '@/types'

export function EcvEvolutionLineChart() {
  const chartRef = useRef<EChartsReact>(null)
  const { loading, error } = useData()
  const selectedProvince = useDashboardStore(s => s.selectedProvince)
  const selectedZoneId = useDashboardStore(s => s.selectedZoneId)
  const selectedYear = useDashboardStore(s => s.selectedYear)

  // Multi-select state lives here — no other component reads it.
  const [selectedKeys, setSelectedKeys] = useState<EcvMetricKey[]>(['zero_dose'])

  const data = useEcvEvolutionLineData(selectedKeys)

  const toggleKey = (key: EcvMetricKey) => {
    setSelectedKeys(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key],
    )
  }

  const scopeLabel = selectedZoneId ? 'zone sélectionnée' : selectedProvince ?? 'national'

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
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-700">
          Évolution de la couverture — Enquête ECV{' '}
          <span className="font-normal text-slate-400">({scopeLabel})</span>
        </h3>
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
                Tout
              </button>
              <button
                type="button"
                onClick={() => setSelectedKeys([])}
                className="text-[10px] font-medium text-slate-400 hover:text-slate-600"
              >
                Aucun
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

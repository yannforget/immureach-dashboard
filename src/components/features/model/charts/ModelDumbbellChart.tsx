import React, { useMemo } from 'react'
import EChartsReact from 'echarts-for-react'
import { useIndicatorComparison } from '@/hooks'
import { buildDumbbellOptions } from '@/lib/charts/dumbbellOptions'

export function ModelDumbbellChart() {
  const comparison = useIndicatorComparison()

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
        <div className="flex flex-1 items-center justify-center bg-slate-50 text-sm text-slate-500">
          No survey indicators for this selection.
        </div>
      </div>
    )
  }

  // Dynamic height so 14 indicators don't squeeze into a fixed box.
  const rowPx = 32
  const overheadPx = 96
  const chartHeight = comparison.items.length * rowPx + overheadPx

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-700">
          Indicateurs comportementaux · {comparison.scopeLabel}
        </h3>
        <p className="text-xs text-slate-500">
          Enfants non vaccinés vs enfants vaccinés, classés en fonction de l'écart (sur une échelle de 0 à 1)
          {comparison.scopeLevel !== comparison.requestedLevel && (
            <span className="ml-1 text-amber-600">· showing {comparison.scopeLevel} fallback</span>
          )}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div style={{ height: chartHeight }}>
          <EChartsReact
            option={options}
            theme="dashboard"
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      </div>
    </div>
  )
}

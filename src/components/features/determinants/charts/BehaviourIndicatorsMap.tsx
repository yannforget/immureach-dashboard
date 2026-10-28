import { useMemo, useRef, useState } from 'react'
import EChartsReact from 'echarts-for-react'
import { useDashboardStore } from '@/store/dashboardStore'
import { useData } from '@/context/DataContext'
import { useBehaviourMapData, useMapSelectionSync, CATEGORY_COLORS, CATEGORY_LABELS, CATEGORY_ORDER } from '@/hooks'
import { buildBehaviourMapOptions } from '@/lib/charts/behaviourMapOptions'
import { ZOOM_MAX, ZOOM_MIN } from '@/lib/charts/ecvMapOptions'
import { MAP_NO_DATA_COLOR } from '@/lib/charts/theme'

// Each province (or zone, once a province is picked) is filled with the COM-B
// colour of the indicator that most separates zero-dose from vaccinated
// children there; the tooltip names that indicator.
export function BehaviourIndicatorsMap() {
  const chartRef = useRef<EChartsReact>(null)
  const selectedProvince = useDashboardStore(s => s.selectedProvince)
  const selectedZoneId = useDashboardStore(s => s.selectedZoneId)
  const selectedYear = useDashboardStore(s => s.selectedYear)
  const setProvince = useDashboardStore(s => s.setProvince)
  const setSelectedZone = useDashboardStore(s => s.setSelectedZone)

  // Remount resets pan/zoom (see EcvZeroDoseMap).
  const [resetNonce, setResetNonce] = useState(0)

  const { loading, error, provinceBboxes } = useData()
  const { features, values, mapName } = useBehaviourMapData()

  const options = useMemo(() => {
    const bbox = selectedProvince ? provinceBboxes[selectedProvince] : undefined
    const boundingCoords: [[number, number], [number, number]] | undefined = bbox
      ? [[bbox[0], bbox[1]], [bbox[2], bbox[3]]]
      : undefined
    return buildBehaviourMapOptions({ values, mapName, boundingCoords })
  }, [values, mapName, selectedProvince, provinceBboxes])

  const chartKey = `behaviour-map-${selectedProvince}-${selectedYear}-${resetNonce}`

  const selectedMapKey = selectedZoneId
    ? features.find(f => f.id === selectedZoneId)?.mapKey ?? null
    : null
  useMapSelectionSync(chartRef, selectedMapKey, chartKey)

  // Zoom lives on the map series here (no geo component); reading it back off
  // the live option keeps the buttons in step with wheel roam.
  const zoomBy = (factor: number) => {
    const chart = chartRef.current?.getEchartsInstance()
    if (!chart) return
    const option = chart.getOption() as { series?: Array<{ zoom?: number }> }
    const current = option.series?.[0]?.zoom ?? 1
    const next = Math.min(Math.max(current * factor, ZOOM_MIN), ZOOM_MAX)
    if (next === current) return
    chart.setOption({ series: [{ zoom: next }] })
  }

  const onEvents = {
    click: (params: any) => {
      if (!params.name) return
      const feature = features.find(f => f.mapKey === params.name)
      if (!feature) return
      if (selectedProvince) {
        if ('provinceId' in feature) setSelectedZone(feature.id)
      } else {
        setProvince(feature.displayName)
      }
    },
  }

  if (loading || error) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50">
        {loading && <p className="text-sm text-slate-500">Chargement de la carte...</p>}
        {error && <p className="text-sm text-red-600">Erreur: {error.message}</p>}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-700">
          Indicateur le plus discriminant · {selectedProvince ? 'zones de santé' : 'provinces'}
        </h3>
        <p className="text-xs text-slate-500">
          Catégorie de l'indicateur présentant le plus grand écart entre enfants non vaccinés et vaccinés
        </p>
      </div>
      <div className="relative min-h-80 flex-1">
        {/* Categorical legend — bottom-left, opposite the zoom controls. */}
        <div className="absolute bottom-3 left-3 z-10 flex flex-col gap-1 rounded-md border border-slate-200 bg-white/95 px-2.5 py-2 text-xs text-slate-600 shadow-sm">
          {CATEGORY_ORDER.map(cat => (
            <span key={cat} className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: CATEGORY_COLORS[cat] }} />
              {CATEGORY_LABELS[cat]}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: MAP_NO_DATA_COLOR }} />
            Aucune donnée
          </span>
        </div>
        <div className="absolute bottom-3 right-3 z-10 flex flex-col overflow-hidden rounded-md border border-slate-200 bg-white/95 shadow-sm">
          <button
            type="button"
            onClick={() => zoomBy(1.4)}
            title="Zoom avant"
            aria-label="Zoom avant"
            className="h-7 w-7 text-sm font-medium leading-none text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => zoomBy(1 / 1.4)}
            title="Zoom arrière"
            aria-label="Zoom arrière"
            className="h-7 w-7 border-t border-slate-200 text-sm font-medium leading-none text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => setResetNonce(n => n + 1)}
            title="Réinitialiser la vue"
            aria-label="Réinitialiser la vue"
            className="h-7 w-7 border-t border-slate-200 text-xs leading-none text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          >
            ⟲
          </button>
        </div>
        <EChartsReact
          ref={chartRef}
          key={chartKey}
          option={options}
          theme="dashboard"
          // echarts-for-react defaults to height: 300px, which would win over
          // inset alone — pin both dimensions to the wrapper.
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          onEvents={onEvents}
        />
      </div>
    </div>
  )
}

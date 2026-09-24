import { useRef, useState } from 'react'
import EChartsReact from 'echarts-for-react'
import { useDashboardStore } from '@/store/dashboardStore'
import { useData } from '@/context/DataContext'
import { useEcvZeroDoseMapData, useMapSelectionSync } from '@/hooks'
import { buildEcvZeroDoseMapOptions, ZOOM_MAX, ZOOM_MIN } from '@/lib/charts/ecvMapOptions'
import { AGE_GROUP_LABELS, DEFAULT_AGE_GROUP, MILIEU_LABELS } from '@/types'

export function EcvZeroDoseMap() {
  const chartRef = useRef<EChartsReact>(null)
  const selectedProvince = useDashboardStore(s => s.selectedProvince)
  const selectedMilieu = useDashboardStore(s => s.selectedMilieu)
  const selectedAgeGroup = useDashboardStore(s => s.selectedAgeGroup)
  const selectedZoneId = useDashboardStore(s => s.selectedZoneId)
  const setProvince = useDashboardStore(s => s.setProvince)
  const setSelectedZone = useDashboardStore(s => s.setSelectedZone)

  // Pan/zoom lives in the ECharts geo model, so the cheapest way to reset it
  // is to remount the chart — `resetNonce` is part of the chart key below.
  const [resetNonce, setResetNonce] = useState(0)

  // Step zoom from the +/- buttons, anchored on the current centre.
  //
  // Not `dispatchAction({ type: 'geoRoam' })`: that action runs with
  // `update: 'updateTransform'`, which re-renders series but explicitly skips
  // component views ("Geo render cost a lot" in echarts.ts). Wheel roam gets
  // away with it because MapDraw's roam controller moves the drawn group
  // itself and only dispatches the action to keep the model in sync — so a
  // bare dispatch updates the model and nothing redraws. Writing zoom back
  // through `setOption` goes down the normal update path, where `resizeGeo`
  // re-applies `geo.zoom` to the coordinate system.
  //
  // The current zoom is read back off the live option (wheel roam writes it
  // there via GeoModel.setZoom) rather than tracked in React state, so the
  // buttons stay in step with wheel/drag roam and an option rebuilt on a store
  // change never carries a stale zoom that would snap the map back.
  const zoomBy = (factor: number) => {
    const chart = chartRef.current?.getEchartsInstance()
    if (!chart) return
    const option = chart.getOption() as { geo?: Array<{ zoom?: number }> }
    const current = option.geo?.[0]?.zoom ?? 1
    const next = Math.min(Math.max(current * factor, ZOOM_MIN), ZOOM_MAX)
    if (next === current) return
    chart.setOption({ geo: { zoom: next } })
  }

  const { loading, error, provinceBboxes } = useData()
  const { features, values, mapName } = useEcvZeroDoseMapData()

  // Zoom into the selected province's bbox, same as the zerodose CoverageMap.
  const provinceBbox = selectedProvince ? provinceBboxes[selectedProvince] : undefined
  const boundingCoords: [[number, number], [number, number]] | undefined = provinceBbox
    ? [[provinceBbox[0], provinceBbox[1]], [provinceBbox[2], provinceBbox[3]]]
    : undefined

  const options = buildEcvZeroDoseMapOptions({ values, mapName, boundingCoords })

  const chartKey = `ecv-map-${selectedProvince}-${selectedMilieu}-${selectedAgeGroup}-${resetNonce}`

  // Highlight the ribbon's zone the same way a click on the shape does. The
  // yellow `select` fill lives in the ECharts series model rather than in the
  // option, so every remount drops it — switching section tabs unmounts this
  // whole panel, and the reset button remounts it on purpose — while the
  // ribbon still holds the zone; hence the re-dispatch, keyed on chartKey.
  // At province level no shape matches, so nothing is selected.
  const selectedMapKey = selectedZoneId
    ? features.find(f => f.id === selectedZoneId)?.mapKey ?? null
    : null
  useMapSelectionSync(chartRef, selectedMapKey, chartKey)

  // Clicking a province shape selects it (drills down to its zones);
  // clicking a zone shape (once drilled down) selects that zone. Matched via
  // mapKey, same as the zerodose CoverageMap, so shared displayNames across
  // provinces don't collide.
  const handleChartClick = (params: any) => {
    if (!params.name) return

    if (selectedProvince) {
      const zone = features.find(f => f.mapKey === params.name)
      if (zone && 'provinceId' in zone) {
        setSelectedZone(zone.id)
      }
    } else {
      const province = features.find(f => f.mapKey === params.name)
      if (province) {
        setProvince(province.displayName)
      }
    }
  }

  const onEvents = {
    click: handleChartClick,
  }

  // Show loading state only after all hooks have been called
  if (loading || error) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50">
        <div className="text-center">
          {loading && (
            <>
              <div className="inline-block animate-spin rounded-full border-4 border-slate-200 border-t-teal-600 h-12 w-12"></div>
              <p className="mt-4 text-sm text-slate-500">Chargement de la carte...</p>
            </>
          )}
          {error && <p className="text-sm text-red-600">Erreur: {error.message}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full relative">
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-700">
          Zéro dose
          {selectedMilieu !== 'all' && (
            <span className="font-normal text-slate-400"> ({MILIEU_LABELS[selectedMilieu]})</span>
          )}
          {selectedAgeGroup !== DEFAULT_AGE_GROUP && (
            <span className="font-normal text-slate-400"> ({AGE_GROUP_LABELS[selectedAgeGroup]})</span>
          )}
        </h3>
      </div>
      <div className="flex-1 relative">
        {/* Zoom controls — fixed at the bottom-right, opposite the colour legend. */}
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
          option={options}
          theme="dashboard"
          style={{ width: '100%', height: '100%' }}
          key={chartKey}
          onEvents={onEvents}
        />
      </div>
    </div>
  )
}
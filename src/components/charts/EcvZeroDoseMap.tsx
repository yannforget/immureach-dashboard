import { useRef } from 'react'
import EChartsReact from 'echarts-for-react'
import { useDashboardStore } from '@/store/dashboardStore'
import { useData } from '@/context/DataContext'
import { useEcvZeroDoseMapData } from '@/hooks/useEcvZeroDoseMapData'
import { buildEcvZeroDoseMapOptions } from '@/lib/charts/ecvMapOptions'

export function EcvZeroDoseMap() {
  const chartRef = useRef<EChartsReact>(null)
  const selectedProvince = useDashboardStore(s => s.selectedProvince)
  const setProvince = useDashboardStore(s => s.setProvince)
  const setSelectedZone = useDashboardStore(s => s.setSelectedZone)

  const { loading, error, provinceBboxes } = useData()
  const { features, values, mapName } = useEcvZeroDoseMapData()

  // Zoom into the selected province's bbox, same as the zerodose CoverageMap.
  const provinceBbox = selectedProvince ? provinceBboxes[selectedProvince] : undefined
  const boundingCoords: [[number, number], [number, number]] | undefined = provinceBbox
    ? [[provinceBbox[0], provinceBbox[1]], [provinceBbox[2], provinceBbox[3]]]
    : undefined

  const options = buildEcvZeroDoseMapOptions({ values, mapName, boundingCoords })

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
        <h3 className="text-sm font-semibold text-slate-700">Zéro dose — Enquête ECV</h3>
      </div>
      <div className="flex-1 relative">
        <EChartsReact
          ref={chartRef}
          option={options}
          theme="dashboard"
          style={{ width: '100%', height: '100%' }}
          key={`ecv-map-${selectedProvince}`}
          onEvents={onEvents}
        />
      </div>
    </div>
  )
}
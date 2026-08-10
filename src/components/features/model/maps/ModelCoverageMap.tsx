import React, { useRef } from 'react'
import EChartsReact from 'echarts-for-react'
import { useDashboardStore } from '@/store/dashboardStore'
import { useProvinceData } from '@/hooks/common/useProvinceData'
import { useZoneData } from '@/hooks/common/useZoneData'
import { useProvinceAntennes } from '@/hooks/common/useProvinceAntennes'
import { useData } from '@/context/DataContext'
import { MODEL_METRIC_META } from '@/lib/utils/constants'
import { buildMapOptions } from '@/lib/charts/mapOptions'
import { Toggle } from '@/components/ui/toggle'

export function ModelCoverageMap() {
  const chartRef = useRef<EChartsReact>(null)
  const selectedProvince = useDashboardStore(s => s.selectedProvince)
  const selectedMetric = useDashboardStore(s => s.selectedMetric)
  const showAntenne = useDashboardStore(s => s.showAntenne)
  const setProvince = useDashboardStore(s => s.setProvince)
  const setHoveredZone = useDashboardStore(s => s.setHoveredZone)
  const setShowAntenne = useDashboardStore(s => s.setShowAntenne)

  const { loading, error, provinceBboxes } = useData()
  const provinces = useProvinceData()
  const zones = useZoneData(selectedProvince)
  const antenneGroups = useProvinceAntennes(selectedProvince)

  const features = selectedProvince ? zones : provinces
  const mapName = selectedProvince ? 'drc-zones' : 'drc-provinces'
  const metricMeta = MODEL_METRIC_META[selectedMetric]

  // Zoom into the selected province's bbox. Zone drill-down does not zoom
  // further — max zoom is the province level.
  const provinceBbox = selectedProvince ? provinceBboxes[selectedProvince] : undefined
  const boundingCoords: [[number, number], [number, number]] | undefined = provinceBbox
    ? [[provinceBbox[0], provinceBbox[1]], [provinceBbox[2], provinceBbox[3]]]
    : undefined

  const options = buildMapOptions({
    features,
    metric: selectedMetric,
    isZeroDose: metricMeta.isZeroDose,
    mapName,
    boundingCoords,
    antenneOverlay: showAntenne && antenneGroups ? antenneGroups : undefined,
  })

  // Handle map selection and hover interactions. We match against `mapKey`
  // (the raw province-prefixed name) because two zones can share a cleaned
  // displayName (e.g. "Bili" in both Bas Uele and Nord Ubangi).
  const handleChartClick = (params: any) => {
    if (params.name) {
      if (selectedProvince) {
        const zone = zones.find(z => z.mapKey === params.name)
        if (zone) {
          useDashboardStore.setState({ selectedZoneId: zone.id })
        }
      } else {
        const province = provinces.find(p => p.mapKey === params.name)
        if (province) {
          setProvince(province.displayName)
        }
      }
    }
  }

  const handleChartMouseOver = (params: any) => {
    if (params.componentType === 'series' && params.name) {
      const zone = zones.find(z => z.mapKey === params.name)
      if (zone) {
        setHoveredZone(zone.id)
      }
    }
  }

  const handleChartMouseOut = () => {
    setHoveredZone(null)
  }

  const onEvents = {
    click: handleChartClick,
    mouseover: handleChartMouseOver,
    mouseout: handleChartMouseOut,
  }


  // Show loading state only after all hooks have been called
  if (loading || error) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50">
        <div className="text-center">
          {loading && (
            <>
              <div className="inline-block animate-spin rounded-full border-4 border-slate-200 border-t-teal-600 h-12 w-12"></div>
              <p className="mt-4 text-sm text-slate-500">Loading map data...</p>
            </>
          )}
          {error && <p className="text-sm text-red-600">Error: {error.message}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full relative">
      <div className="flex-1 relative">
        <EChartsReact
          ref={chartRef}
          option={options}
          theme="dashboard"
          style={{ width: '100%', height: '100%' }}
          key={`map-${selectedProvince}-${selectedMetric}-${showAntenne ? 'a' : 'm'}`}
          onEvents={onEvents}
        />
        {selectedProvince && antenneGroups && (
          <Toggle
            size="sm"
            pressed={showAntenne}
            onPressedChange={setShowAntenne}
            aria-label="Toggle antenne overlay"
            className="absolute top-2 right-2 z-10 border border-slate-200 bg-white/90 backdrop-blur"
          >
            Antennes
          </Toggle>
        )}
      </div>
    </div>
  )
}

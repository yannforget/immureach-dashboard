import { useRef } from 'react'
import EChartsReact from 'echarts-for-react'
import { useDashboardStore } from '@/store/dashboardStore'
import { useProvinceData } from '@/hooks/useProvinceData'
import { useZoneData } from '@/hooks/useZoneData'
import { useData } from '@/context/DataContext'
import { METRIC_META } from '@/lib/dataUtils'
import { buildMapOptions } from '@/lib/charts/mapOptions'

const PROVINCES_WITH_ANTENNES = [
  'Kwilu',
  'Kasai',
  'Sankuru',
]

export function CoverageMap() {
  const chartRef = useRef<EChartsReact>(null)
  const selectedProvince = useDashboardStore(s => s.selectedProvince)
  const selectedMetric = useDashboardStore(s => s.selectedMetric)
  const showAntennes = useDashboardStore(s => s.showAntennes)
  const setShowAntennes = useDashboardStore(s => s.setShowAntennes)
  const setProvince = useDashboardStore(s => s.setProvince)
  const setHoveredZone = useDashboardStore(s => s.setHoveredZone)

  const { loading, error } = useData()
  const provinces = useProvinceData()
  const zones = useZoneData(selectedProvince)

  const features = selectedProvince ? zones : provinces
  const mapName = selectedProvince ? 'drc-zones' : 'drc-provinces'
  const metricMeta = METRIC_META[selectedMetric]

  const canShowAntennes =
    selectedProvince && PROVINCES_WITH_ANTENNES.includes(selectedProvince)

  const options = buildMapOptions({
    features,
    metric: selectedMetric,
    isZeroDose: metricMeta.isZeroDose,
    mapName,
    showAntennes: canShowAntennes ? showAntennes : false,
    zoneRows: zones,
  })

  // Handle map selection and hover interactions
  const handleChartClick = (params: any) => {
    if (params.name) {
      if (selectedProvince) {
        // If showing zones, select the clicked zone
        const zone = zones.find(z => z.displayName === params.name)
        if (zone) {
          useDashboardStore.setState({ selectedZoneId: zone.id })
        }
      } else {
        // If showing provinces, select the province
        const province = provinces.find(p => p.displayName === params.name)
        if (province) {
          setProvince(province.displayName)
        }
      }
    }
  }

  const handleChartMouseOver = (params: any) => {
    if (params.componentType === 'series' && params.name) {
      const zone = zones.find(z => z.displayName === params.name)
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
          key={`map-${selectedProvince}-${selectedMetric}-${showAntennes}`}
          onEvents={onEvents}
        />
        {selectedProvince && canShowAntennes && (
          <button
            onClick={() => setShowAntennes(!showAntennes)}
            className={`absolute top-3 right-3 z-10 px-3 py-1 rounded text-xs font-medium transition-colors ${
              showAntennes
                ? 'bg-teal-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Antennes
          </button>
        )}
      </div>
    </div>
  )
}

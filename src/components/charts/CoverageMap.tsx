import { useEffect, useRef } from 'react'
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

  // Handle map clicks - try multiple event types to find which one fires
  useEffect(() => {
    const chart = chartRef.current?.getEchartsInstance()
    if (!chart) return

    // Generic event handler that logs all echarts events
    const handleAnyEvent = (params: any) => {
      console.log('ECharts event fired:', {
        type: params.type,
        componentType: params.componentType,
        name: params.name,
        seriesName: params.seriesName,
        dataIndex: params.dataIndex
      })

      // Try to extract the area name from various possible params
      const areaName = params.name || params.seriesName

      if (areaName) {
        if (selectedProvince) {
          // If already showing zones, select the clicked zone
          const zone = zones.find(z => z.displayName === areaName)
          if (zone) {
            console.log('Selected zone:', areaName)
            useDashboardStore.setState({ selectedZoneId: zone.id })
          }
        } else {
          // If showing provinces, select the province
          const province = provinces.find(p => p.displayName === areaName)
          if (province) {
            console.log('Selected province:', areaName)
            setProvince(province.displayName)
          }
        }
      }
    }

    // List of events to try
    const eventsToTry = ['click', 'mouseclick', 'selectchanged', 'itemclick', 'seriesclick', 'geoselectchanged']

    console.log('Attaching event handlers:', eventsToTry)
    eventsToTry.forEach(event => {
      chart.on(event, handleAnyEvent)
    })

    return () => {
      console.log('Detaching event handlers')
      eventsToTry.forEach(event => {
        chart.off(event, handleAnyEvent)
      })
    }
  }, [selectedProvince, zones, provinces, setProvince])

  // Handle hover interactions
  useEffect(() => {
    const chart = chartRef.current?.getEchartsInstance()
    if (!chart) return

    const handleMouseOver = (params: any) => {
      console.log('Mouseover detected:', params.name)
      if (params.componentType === 'series' && params.name) {
        const zone = zones.find(z => z.displayName === params.name)
        if (zone) {
          setHoveredZone(zone.id)
        }
      }
    }

    const handleMouseOut = () => {
      console.log('Mouseout detected')
      setHoveredZone(null)
    }

    chart.on('mouseover', handleMouseOver)
    chart.on('mouseout', handleMouseOut)

    return () => {
      chart.off('mouseover', handleMouseOver)
      chart.off('mouseout', handleMouseOut)
    }
  }, [zones, setHoveredZone])

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

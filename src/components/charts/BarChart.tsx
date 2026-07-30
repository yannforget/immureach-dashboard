import { useEffect, useRef, useState } from 'react'
import EChartsReact from 'echarts-for-react'
import { useDashboardStore } from '@/store/dashboardStore'
import { useProvinceData } from '@/hooks/useProvinceData'
import { useZoneData } from '@/hooks/useZoneData'
import { useData } from '@/context/DataContext'
import { METRIC_META } from '@/lib/dataUtils'
import { buildBarOptions } from '@/lib/charts/barOptions'

type BarDataType = 'coverage' | 'children' | 'births'

export function BarChart() {
  const [barDataType, setBarDataType] = useState<BarDataType>('coverage')
  const chartRef = useRef<EChartsReact>(null)
  const selectedProvince = useDashboardStore(s => s.selectedProvince)
  const selectedMetric = useDashboardStore(s => s.selectedMetric)
  const hoveredZoneId = useDashboardStore(s => s.hoveredZoneId)
  const setSelectedZone = useDashboardStore(s => s.setSelectedZone)
  const setHoveredZone = useDashboardStore(s => s.setHoveredZone)

  const { loading } = useData()
  const provinces = useProvinceData()
  const zones = useZoneData(selectedProvince)

  const rows = selectedProvince ? zones : provinces
  const metricMeta = METRIC_META[selectedMetric]

  // Determine suffix and data column based on barDataType
  let suffix = '%'
  let dataColumn: string = selectedMetric

  if (barDataType === 'children') {
    suffix = ' enfants'
    dataColumn = metricMeta.countKey
  } else if (barDataType === 'births') {
    suffix = ' naissance/an'
    dataColumn = 'births_per_year'
  }

  // Prepare bar data. Rows without a numeric value for the current mode are
  // dropped (so ungauged zones don't appear as a 0-bar in coverage/children
  // modes). The births mode is always populated.
  const barData = rows
    .map(row => {
      const props = row.properties as any
      let value: number | null = null

      if (barDataType === 'coverage') {
        const raw = props[selectedMetric]
        value = typeof raw === 'number' ? raw * 100 : null
      } else if (barDataType === 'children') {
        const raw = props[dataColumn]
        value = typeof raw === 'number' ? raw : null
      } else if (barDataType === 'births') {
        const raw = props[dataColumn]
        value = typeof raw === 'number' ? raw : null
      }

      const countRaw = props[metricMeta.countKey]
      return {
        name: row.displayName,
        value,
        count: typeof countRaw === 'number' ? countRaw : 0,
        id: row.id,
      }
    })
    .filter((item): item is { name: string; value: number; count: number; id: string } =>
      typeof item.value === 'number'
    )
    // Sort here (ascending) so the rendered chart order matches the array the
    // mouseover / click handlers index into via params.dataIndex.
    .sort((a, b) => a.value - b.value)

  // Calculate chart height based on number of items
  // Use consistent bar height of 28px per item + overhead for axes/margins
  const barHeightPx = 28
  const chartOverhead = 60 // axes, labels, padding
  const chartHeight = barData.length * barHeightPx + chartOverhead
  const maxContainerHeight = 600 // max height before scrolling kicks in

  const options = buildBarOptions({
    items: barData,
    hoveredId: hoveredZoneId,
    metricLabel: metricMeta.label,
    suffix,
    isZeroDose: metricMeta.isZeroDose,
  })

  // Handle bar clicks
  useEffect(() => {
    const chart = chartRef.current?.getEchartsInstance()
    if (!chart) return

    const handleClick = (params: any) => {
      if (params.componentType === 'series') {
        const item = barData[params.dataIndex]
        if (item && selectedProvince) {
          setSelectedZone(item.id)
        }
      }
    }

    chart.on('click', handleClick)
    return () => {
      chart.off('click', handleClick)
    }
  }, [selectedProvince, barData, setSelectedZone])

  // Handle hover interactions
  useEffect(() => {
    const chart = chartRef.current?.getEchartsInstance()
    if (!chart) return

    const handleMouseOver = (params: any) => {
      if (params.componentType === 'series') {
        const item = barData[params.dataIndex]
        if (item) {
          setHoveredZone(item.id)
        }
      }
    }

    const handleMouseOut = () => {
      setHoveredZone(null)
    }

    chart.on('mouseover', handleMouseOver)
    chart.on('mouseout', handleMouseOut)

    return () => {
      chart.off('mouseover', handleMouseOver)
      chart.off('mouseout', handleMouseOut)
    }
  }, [barData, setHoveredZone])

  // Show loading state only after all hooks have been called
  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-700">
            {selectedProvince ? 'Zones' : 'Provinces'} - {metricMeta.label}
          </h3>
        </div>
        <div className="flex flex-1 items-center justify-center bg-slate-50">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full border-4 border-slate-200 border-t-teal-600 h-12 w-12"></div>
            <p className="mt-4 text-sm text-slate-500">Loading chart data...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full relative">
      <div
        className="overflow-y-auto overflow-x-hidden flex-1 relative"
        style={{
          height: chartHeight > maxContainerHeight ? `${maxContainerHeight}px` : '100%'
        }}
      >
        <div style={{ width: '100%', height: `${chartHeight}px`, paddingTop: '45px' }}>
          <EChartsReact
            ref={chartRef}
            option={options}
            theme="dashboard"
            style={{ width: '100%', height: '100%' }}
            key={`bar-${selectedProvince}-${selectedMetric}`}
          />
        </div>
        <div className="absolute top-3 right-3 z-10 flex gap-2">
          <button
            onClick={() => setBarDataType('coverage')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${barDataType === 'coverage'
              ? 'bg-teal-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
          >
            Couverture (%)
          </button>
          <button
            onClick={() => setBarDataType('children')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${barDataType === 'children'
              ? 'bg-teal-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
          >
            # Enfants
          </button>
          <button
            onClick={() => setBarDataType('births')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${barDataType === 'births'
              ? 'bg-teal-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
          >
            # Naissances/An
          </button>
        </div>
      </div>
    </div>
  )
}

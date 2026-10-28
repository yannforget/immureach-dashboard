import { useRef } from 'react'
import EChartsReact from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { Download } from 'lucide-react'
import { InfoBubble } from '@/components/common/InfoBubble'
import { Button } from '@/components/ui/button'
import { downloadDataUrl } from '@/lib/utils/download'

interface ActionChartPanelProps {
  title: string
  info: string
  subtitle?: React.ReactNode
  options: EChartsOption | null
  filename: string
  onEvents?: Record<string, (params: any) => void>
  // Extra controls shown next to the download button.
  actions?: React.ReactNode
}

// Card shared by the actions tab charts: title + help bubble, PNG download
// and the chart itself filling the remaining height.
export function ActionChartPanel({
  title,
  info,
  subtitle,
  options,
  filename,
  onEvents,
  actions,
}: ActionChartPanelProps) {
  const chartRef = useRef<EChartsReact>(null)

  const handleDownloadPng = () => {
    const chart = chartRef.current?.getEchartsInstance()
    if (!chart) return
    downloadDataUrl(
      chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' }),
      `${filename}.png`,
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
            <InfoBubble text={info} />
          </div>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {actions}
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs text-slate-600"
            disabled={!options}
            onClick={handleDownloadPng}
          >
            <Download className="h-3.5 w-3.5" />
            PNG
          </Button>
        </div>
      </div>
      {options ? (
        <div className="min-h-0 flex-1">
          <EChartsReact
            ref={chartRef}
            option={options}
            notMerge
            theme="dashboard"
            onEvents={onEvents}
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center bg-slate-50 text-sm text-slate-500">
          Analyse contrefactuelle indisponible.
        </div>
      )}
    </div>
  )
}

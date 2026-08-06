import { useRef } from 'react'
import EChartsReact from 'echarts-for-react'
import { useDashboardStore } from '@/store/dashboardStore'
import { useData } from '@/context/DataContext'
import { useEcvVaccCovRow } from '@/hooks/ecv/useEcvVaccCovRow'
import { ECV_BAR_METRIC_KEYS } from '@/lib/utils/constants'
import { ECV_METRIC_META } from '@/lib/utils/constants'
import { buildEcvVaccineBarOptions, type EcvBarItem } from '@/lib/charts/ecvBarOptions'

export function EcvVaccineBarChart() {
  const chartRef = useRef<EChartsReact>(null)
  const { loading } = useData()
  const row = useEcvVaccCovRow()
  const selectedProvince = useDashboardStore(s => s.selectedProvince)
  const selectedZoneId = useDashboardStore(s => s.selectedZoneId)

  // One bar per vaccine dose (BCG, Penta1-3, Polio0-3, PCV1-3, ROTA1-3, VPI, VAR, VAA), each with its 95% CI. 
  // Rows without a value are dropped so missing indicators don't render as 0-bars. 
  // Sorted ascending so the widest bar ends up at the top, matching the dashboard's bar-chart convention.
  const items: EcvBarItem[] = ECV_BAR_METRIC_KEYS
    .map(key => {
      const metric = row?.metrics[key]
      return {
        name: ECV_METRIC_META[key].label,
        value: metric?.pct ?? null,
        ciLow: metric?.ciLow ?? null,
        ciHigh: metric?.ciHigh ?? null,
      }
    })
    .filter((item): item is EcvBarItem => item.value !== null)
    .sort((a, b) => (a.value as number) - (b.value as number))

  const options = buildEcvVaccineBarOptions({ items })

  const scopeLabel = selectedZoneId ? 'zone sélectionnée' : selectedProvince ? selectedProvince : 'national'

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-700">Couverture vaccinale — Enquête ECV</h3>
        </div>
        <div className="flex flex-1 items-center justify-center bg-slate-50">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full border-4 border-slate-200 border-t-teal-600 h-12 w-12"></div>
            <p className="mt-4 text-sm text-slate-500">Chargement du graphique...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full relative">
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-700">
          Couverture vaccinale — Enquête ECV <span className="font-normal text-slate-400">({scopeLabel})</span>
        </h3>
      </div>
      <div className="flex-1 relative">
        {items.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            Aucune donnée ECV pour cette sélection
          </div>
        ) : (
          <EChartsReact
            ref={chartRef}
            option={options}
            theme="dashboard"
            style={{ width: '100%', height: '100%' }}
            key={`ecv-bar-${selectedProvince}-${selectedZoneId}`}
          />
        )}
      </div>
    </div>
  )
}
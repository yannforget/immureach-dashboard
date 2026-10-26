import { useMemo, useRef, useState } from 'react'
import EChartsReact from 'echarts-for-react'
import { ChevronDown, Download } from 'lucide-react'
import { useDashboardStore } from '@/store/dashboardStore'
import { useData } from '@/context/DataContext'
import { useEcvVaccCovRow, useZoneData } from '@/hooks'
import { ECV_BAR_METRIC_KEYS } from '@/lib/utils/constants'
import { ECV_METRIC_META } from '@/lib/utils/constants'
import { buildEcvVaccineBarOptions, type EcvBarItem } from '@/lib/charts/ecvBarOptions'
import { buildEcvVaccineBarCsv, buildScopeSlug, downloadDataUrl, downloadText } from '@/lib/utils/download'
import { ageGroupSlug, milieuSlug, withAgeGroup, withMilieu } from '@/lib/utils/ecvScope'
import { Button } from '@/components/ui/button'

export function EcvVaccineBarChart() {
  const chartRef = useRef<EChartsReact>(null)
  const { loading } = useData()
  const row = useEcvVaccCovRow()
  const selectedProvince = useDashboardStore(s => s.selectedProvince)
  const selectedZoneId = useDashboardStore(s => s.selectedZoneId)
  const selectedMilieu = useDashboardStore(s => s.selectedMilieu)
  const selectedAgeGroup = useDashboardStore(s => s.selectedAgeGroup)
  const selectedYear = useDashboardStore(s => s.selectedYear)

  const [downloadOpen, setDownloadOpen] = useState(false)
  const zones = useZoneData(selectedProvince)
  const zoneName = selectedZoneId
    ? zones.find(z => z.id === selectedZoneId)?.displayName ?? null
    : null

  // One bar per vaccine dose (BCG, Penta1-3, Polio0-3, PCV1-3, ROTA1-3, VPI, VAR, VAA), each with its 95% CI. 
  // Rows without a value are dropped so missing indicators don't render as 0-bars. 
  // Sorted ascending so the widest bar ends up at the top, matching the dashboard's bar-chart convention.
  const items: EcvBarItem[] = useMemo(() => ECV_BAR_METRIC_KEYS
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
    .sort((a, b) => (a.value as number) - (b.value as number)),
  [row])

  const options = useMemo(() => buildEcvVaccineBarOptions({ items }), [items])

  const scopeLabel = withAgeGroup(
    withMilieu(
      selectedZoneId ? 'zone sélectionnée' : selectedProvince ? selectedProvince : 'national',
      selectedMilieu,
    ),
    selectedAgeGroup,
  )

  const baseFilename = `ecv-couverture-${buildScopeSlug(selectedProvince, zoneName)}${milieuSlug(selectedMilieu)}${ageGroupSlug(selectedAgeGroup)}-${selectedYear}`
  const downloadDisabled = items.length === 0

  const handleDownloadPng = () => {
    const chart = chartRef.current?.getEchartsInstance()
    if (!chart) return
    const url = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' })
    downloadDataUrl(url, `${baseFilename}.png`)
    setDownloadOpen(false)
  }

  const handleDownloadCsv = () => {
    downloadText(
      buildEcvVaccineBarCsv(
        items,
        { province: selectedProvince, zone: zoneName, ageGroup: selectedAgeGroup, milieu: selectedMilieu },
        selectedYear,
      ),
      `${baseFilename}.csv`,
      'text/csv',
    )
    setDownloadOpen(false)
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-700">Couverture vaccinale</h3>
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
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-700">
          Couverture vaccinale <span className="font-normal text-slate-400">({scopeLabel})</span>
        </h3>
        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs text-slate-600"
            disabled={downloadDisabled}
            aria-haspopup="menu"
            aria-expanded={downloadOpen}
            onClick={() => setDownloadOpen(o => !o)}
          >
            <Download className="h-3.5 w-3.5" />
            Télécharger
            <ChevronDown className={`h-3 w-3 transition-transform ${downloadOpen ? 'rotate-180' : ''}`} />
          </Button>
          {downloadOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setDownloadOpen(false)} />
              <div className="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                <button
                  type="button"
                  onClick={handleDownloadPng}
                  className="flex w-full items-center px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-100"
                >
                  Graphique (PNG)
                </button>
                <button
                  type="button"
                  onClick={handleDownloadCsv}
                  className="flex w-full items-center px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-100"
                >
                  Données (CSV)
                </button>
              </div>
            </>
          )}
        </div>
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
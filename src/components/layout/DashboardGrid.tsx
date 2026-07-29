// import { Breadcrumb } from '../Breadcrumb'
import { Ribbon } from '../Ribbon'
import { PlaceholderPanel } from '../PlaceholderPanel'
import { IndicatorCardsZeroDose } from '../IndicatorCardsZeroDose'
import { IndicatorCardsECV } from '../IndicatorCardsECV'
import { CoverageMap } from '../charts/CoverageMap'
import { BarChart } from '../charts/BarChart'
import { DataTable } from '../table/DataTable'
import { ProfilingPanel } from '../ProfilingPanel'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { useDashboardStore } from '@/store/dashboardStore'
import type { ViewMode } from '@/types'

export function DashboardGrid() {
  const activeSection = useDashboardStore(s => s.activeSection)
  const viewMode = useDashboardStore(s => s.viewMode)
  const setViewMode = useDashboardStore(s => s.setViewMode)

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {/* Ribbon: 4 section tabs + filters (year, province, zone) */}
      <section className="mb-8">
        <Ribbon />
      </section>

      {activeSection === 'ecv' && (<section className="mb-8">
        <IndicatorCardsECV />
      </section>
      )}
      {activeSection === 'determinants' && <PlaceholderPanel title="Déterminants ménages" />}
      {activeSection === 'actions' && <PlaceholderPanel title="Actions / interventions" />}

      {activeSection === 'zerodose' && (
        <>
          {/* Indicator Cards */}
          <section className="mb-8">
            <IndicatorCardsZeroDose />
          </section>
          {/* Charts Grid */}
          <section className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="h-96 overflow-hidden rounded-lg border border-slate-200 bg-white">
              <CoverageMap />
            </div>
            <div className="h-96 overflow-hidden rounded-lg border border-slate-200 bg-white">
              <BarChart />
            </div>
          </section>

          {/* Mode-switched lower panel: Data table vs Profiling charts */}
          <section>
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
              <div className="flex items-center justify-between gap-4">
                <TabsList>
                  <TabsTrigger value="data">Data</TabsTrigger>
                  <TabsTrigger value="profiling">Profiling</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="data">
                <div className="rounded-lg border border-slate-200 bg-white">
                  <DataTable />
                </div>
              </TabsContent>
              <TabsContent value="profiling">
                <ProfilingPanel />
              </TabsContent>
            </Tabs>
          </section>
        </>
      )
      }
    </div >
  )
}
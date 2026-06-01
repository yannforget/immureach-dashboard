import { Breadcrumb } from '../Breadcrumb'
import { IndicatorCards } from '../IndicatorCards'
import { CoverageMap } from '../charts/CoverageMap'
import { BarChart } from '../charts/BarChart'
import { DataTable } from '../table/DataTable'
import { ProfilingPanel } from '../ProfilingPanel'
import { YearSelector } from '../YearSelector'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { useDashboardStore } from '@/store/dashboardStore'
import type { ViewMode } from '@/types'

export function DashboardGrid() {
  const viewMode = useDashboardStore(s => s.viewMode)
  const setViewMode = useDashboardStore(s => s.setViewMode)

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {/* Breadcrumb */}
      <section className="mb-4">
        <Breadcrumb />
      </section>

      {/* Indicator Cards */}
      <section className="mb-8">
        <IndicatorCards />
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
            {viewMode === 'profiling' && <YearSelector />}
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
    </div>
  )
}

import { ProvinceSelector } from '../ProvinceSelector'
import { IndicatorCards } from '../IndicatorCards'
import { CoverageMap } from '../charts/CoverageMap'
import { BarChart } from '../charts/BarChart'
import { DataTable } from '../table/DataTable'

export function DashboardGrid() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {/* Province Selector */}
      <section className="mb-8">
        <ProvinceSelector />
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

      {/* Data Table */}
      <section className="rounded-lg border border-slate-200 bg-white">
        <DataTable />
      </section>
    </div>
  )
}

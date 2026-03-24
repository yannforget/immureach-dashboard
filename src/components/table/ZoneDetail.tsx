import { useDashboardStore } from '@/store/dashboardStore'
import { METRIC_KEYS, METRIC_META } from '@/lib/dataUtils'
import type { ZoneRow } from '@/types'

interface ZoneDetailProps {
  row: ZoneRow
  zoneName: string | null
}

export function ZoneDetail({ row, zoneName }: ZoneDetailProps) {
  const setSelectedZone = useDashboardStore(s => s.setSelectedZone)

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">
          {zoneName || row.displayName}
        </h3>
        <button
          onClick={() => setSelectedZone(null)}
          className="text-xs font-medium text-teal-600 hover:text-teal-700"
        >
          ← Back to Zones
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {METRIC_KEYS.map(key => {
          const meta = METRIC_META[key]
          const value = (row.properties as any)[key]
          const countValue = (row.properties as any)[meta.countKey]

          const displayValue = typeof value === 'number'
            ? Math.round(value * 100)
            : '—'
          const formattedCount = typeof countValue === 'number'
            ? Math.round(countValue).toLocaleString()
            : '—'
          const countLabel = `${formattedCount} (6-24 mo)`

          return (
            <div
              key={key}
              className="rounded border border-slate-200 bg-slate-50 p-2"
            >
              <h4 className="text-xs font-medium text-slate-600 cursor-help" title={meta.description}>
                {meta.label}
              </h4>
              <p className="mt-1 text-lg font-bold text-slate-900">
                {displayValue}
                <span className="text-sm text-slate-600">%</span>
              </p>
              <p className="text-xs text-slate-500">{countLabel}</p>
            </div>
          )
        })}
      </div>

      {(row.properties as any).antenne && (
        <div className="rounded border border-blue-200 bg-blue-50 p-3">
          <p className="text-xs font-medium text-blue-900">
            Antenne: {(row.properties as any).antenne}
          </p>
        </div>
      )}
    </div>
  )
}

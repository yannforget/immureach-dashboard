import { useDashboardStore } from '@/store/dashboardStore'
import { useData } from '@/context/DataContext'
import type { Year } from '@/types'

export function YearSelector() {
  const { profile } = useData()
  const selectedYear = useDashboardStore((s) => s.selectedYear)
  const setSelectedYear = useDashboardStore((s) => s.setSelectedYear)

  const years: Year[] = profile?.years ?? [2022, 2023]

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-slate-500">Survey year</span>
      <div className="inline-flex rounded-md bg-slate-100 p-1">
        {years.map((y) => (
          <button
            key={y}
            onClick={() => setSelectedYear(y)}
            className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${selectedYear === y
              ? 'bg-white text-teal-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
              }`}
          >
            {y}
          </button>
        ))}
      </div>
    </div>
  )
}

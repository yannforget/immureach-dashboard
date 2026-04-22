import { useState, useMemo } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useDashboardStore } from '@/store/dashboardStore'
import { METRIC_KEYS, METRIC_META } from '@/lib/dataUtils'
import type { ZoneRow } from '@/types'

interface ZoneTableProps {
  rows: ZoneRow[]
}

type SortKey = 'name' | 'births' | 'total_population' | string

export function ZoneTable({ rows }: ZoneTableProps) {
  const setSelectedZone = useDashboardStore(s => s.setSelectedZone)
  const setProvince = useDashboardStore(s => s.setProvince)
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  const sortedRows = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      let aVal: any
      let bVal: any

      if (sortKey === 'name') {
        aVal = a.displayName
        bVal = b.displayName
      } else if (sortKey === 'births') {
        aVal = (a.properties as any).births_per_year ?? 0
        bVal = (b.properties as any).births_per_year ?? 0
      } else if (sortKey === 'total_population') {
        aVal = (a.properties as any).total_population ?? 0
        bVal = (b.properties as any).total_population ?? 0
      } else {
        aVal = ((a.properties as any)[sortKey] ?? 0) * 100
        bVal = ((b.properties as any)[sortKey] ?? 0) * 100
      }

      if (typeof aVal === 'string') {
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal)
      }

      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
    })

    return sorted
  }, [rows, sortKey, sortDirection])

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-slate-200 px-4 py-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Zones</h3>
        <button
          onClick={() => setProvince(null)}
          className="text-xs font-medium text-teal-600 hover:text-teal-700"
        >
          ← Back to Provinces
        </button>
      </div>

      <div className="flex-1 overflow-x-auto">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead
                className="w-32 cursor-pointer hover:bg-slate-100"
                onClick={() => handleSort('name')}
              >
                Zone{sortKey === 'name' ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : null}
              </TableHead>
              <TableHead
                className="text-right cursor-pointer hover:bg-slate-100"
                onClick={() => handleSort('total_population')}
                title="Estimated total population of the zone de santé"
              >
                Population{sortKey === 'total_population' ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : null}
              </TableHead>
              <TableHead
                className="text-right cursor-pointer hover:bg-slate-100"
                onClick={() => handleSort('births')}
                title="Estimated number of live births per year"
              >
                Births/Year{sortKey === 'births' ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : null}
              </TableHead>
              {METRIC_KEYS.map(key => {
                const meta = METRIC_META[key]
                return (
                  <TableHead
                    key={key}
                    className="text-right cursor-pointer hover:bg-slate-100"
                    onClick={() => handleSort(key)}
                    title={meta.description}
                  >
                    {meta.label}
                    {sortKey === key ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : null}
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.map(row => (
              <TableRow
                key={row.id}
                className="cursor-pointer hover:bg-slate-100/50"
                onClick={() => setSelectedZone(row.id)}
              >
                <TableCell className="font-medium w-32">
                  {row.displayName}
                </TableCell>
                <TableCell className="text-right">
                  <div className="text-xs text-slate-400">
                    {typeof (row.properties as any).total_population === 'number'
                      ? Math.round((row.properties as any).total_population).toLocaleString()
                      : '—'}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="text-xs text-slate-400">
                    {typeof (row.properties as any).births_per_year === 'number'
                      ? Math.round((row.properties as any).births_per_year).toLocaleString()
                      : '—'}
                  </div>
                </TableCell>
                {METRIC_KEYS.map(key => {
                  const meta = METRIC_META[key]
                  const value = (row.properties as any)[key]
                  const countValue = (row.properties as any)[meta.countKey]
                  const displayValue = typeof value === 'number'
                    ? (value * 100).toFixed(1)
                    : '—'
                  const suffix = '%'
                  const displayCount = typeof countValue === 'number'
                    ? Math.round(countValue).toLocaleString()
                    : '—'
                  return (
                    <TableCell key={key} className="text-right">
                      <div className="text-slate-600 font-medium">
                        {displayValue}{suffix}
                      </div>
                      <div className="text-xs text-slate-400">
                        {displayCount}
                      </div>
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

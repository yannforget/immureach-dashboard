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
import { MODEL_METRIC_KEYS, MODEL_METRIC_META } from '@/lib/utils/constants'
import type { ZoneRow } from '@/types'

interface ZoneTableProps {
  rows: ZoneRow[]
}

type SortKey = 'name' | 'births' | 'total_population' | string

export function ZoneTable({ rows }: ZoneTableProps) {
  const setSelectedZone = useDashboardStore(s => s.setSelectedZone)
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
      if (sortKey === 'name') {
        return sortDirection === 'asc'
          ? a.displayName.localeCompare(b.displayName)
          : b.displayName.localeCompare(a.displayName)
      }

      const propKey = sortKey === 'births' ? 'births_per_year' : sortKey
      const av = (a.properties as any)[propKey]
      const bv = (b.properties as any)[propKey]
      const aNull = typeof av !== 'number'
      const bNull = typeof bv !== 'number'

      // Nulls sink to the bottom regardless of sort direction.
      if (aNull && bNull) return 0
      if (aNull) return 1
      if (bNull) return -1

      return sortDirection === 'asc' ? av - bv : bv - av
    })

    return sorted
  }, [rows, sortKey, sortDirection])

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-slate-200 px-4 py-2">
        <h3 className="text-sm font-semibold text-slate-700">Zones</h3>
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
              {MODEL_METRIC_KEYS.map(key => {
                const meta = MODEL_METRIC_META[key]
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
                {MODEL_METRIC_KEYS.map(key => {
                  const meta = MODEL_METRIC_META[key]
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

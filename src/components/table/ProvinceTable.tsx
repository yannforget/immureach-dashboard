import { useState, useMemo } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { METRIC_KEYS, METRIC_META } from '@/lib/dataUtils'
import type { ProvinceRow } from '@/types'

interface ProvinceTableProps {
  rows: ProvinceRow[]
}

type SortKey = 'name' | 'births' | 'pop6_24mo' | string

export function ProvinceTable({ rows }: ProvinceTableProps) {
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
      } else if (sortKey === 'pop6_24mo') {
        aVal = (a.properties as any).pop_6_24mo ?? 0
        bVal = (b.properties as any).pop_6_24mo ?? 0
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
  const getSortIndicator = (key: SortKey) => {
    if (sortKey !== key) return null
    return sortDirection === 'asc' ? ' ▲' : ' ▼'
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead
              className="w-32 cursor-pointer hover:bg-slate-100"
              onClick={() => handleSort('name')}
            >
              Province{getSortIndicator('name')}
            </TableHead>
            {METRIC_KEYS.map(key => {
              const meta = METRIC_META[key]
              return (
                <TableHead
                  key={key}
                  className="whitespace-nowrap text-right cursor-pointer hover:bg-slate-100"
                  onClick={() => handleSort(key)}
                  title={meta.description}
                >
                  {meta.label}
                  {getSortIndicator(key)}
                </TableHead>
              )
            })}
            <TableHead
              className="whitespace-nowrap text-right cursor-pointer hover:bg-slate-100"
              onClick={() => handleSort('births')}
              title="Estimated number of live births per year"
            >
              Births/Year{getSortIndicator('births')}
            </TableHead>
            <TableHead
              className="whitespace-nowrap text-right cursor-pointer hover:bg-slate-100"
              onClick={() => handleSort('pop6_24mo')}
              title="Estimated population of children aged 6-24 months"
            >
              6-24 mo{getSortIndicator('pop6_24mo')}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRows.map(row => (
            <TableRow key={row.id}>
              <TableCell className="font-medium w-32">
                {row.displayName}
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
              <TableCell className="text-right">
                <div className="text-xs text-slate-400">
                  {typeof (row.properties as any).births_per_year === 'number'
                    ? Math.round((row.properties as any).births_per_year).toLocaleString()
                    : '—'}
                </div>
              </TableCell>
              <TableCell className="text-right">
                <div className="text-xs text-slate-400">
                  {typeof (row.properties as any).pop_6_24mo === 'number'
                    ? Math.round((row.properties as any).pop_6_24mo).toLocaleString()
                    : '—'}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

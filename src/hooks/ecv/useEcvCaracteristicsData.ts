import { useMemo } from 'react'
import { useData } from '@/context/DataContext'
import { useDashboardStore } from '@/store/dashboardStore'
import { normalizeAreaName } from '@/lib/utils/ecvVaccCov'
import { useZoneData } from '../common/useZoneData'
import {
  ECV_CARACTERISTIC_GROUPS,
  ECV_CARACTERISTIC_VARIABLE_LABELS,
} from '@/lib/utils/constants'
import type { EcvCaracteristicsRow } from '@/types'

export interface EcvCaracteristicSeries {
  key: string
  label: string
}

export interface EcvCaracteristicGroup {
  key: string
  label: string
  series: EcvCaracteristicSeries[]
}

export interface EcvCaracteristicBar {
  name: string
  // Variable root -> pct (null when the source cell was empty).
  values: Record<string, number | null>
  // True for the bar matching the ribbon's selected zone, so charts can
  // highlight it (e.g. yellow) while still showing every province zone.
  highlighted?: boolean
}

export interface EcvCaracteristicsData {
  groups: EcvCaracteristicGroup[]
  areas: EcvCaracteristicBar[]
  scopeLabel: string
}

function humanizeVariable(root: string): string {
  return root.replace(/_/g, ' ')
}

// Derives the tab list from the CSV's `<root>_pct` columns. "mere" and
// "gardienne" (two answers to the same question) share one tab per
// ECV_CARACTERISTIC_GROUPS; every other variable — including columns added
// to the file later — becomes its own single-series tab, in header order.
function buildGroups(variables: string[]): EcvCaracteristicGroup[] {
  const groups: EcvCaracteristicGroup[] = []
  const emitted = new Set<string>()

  for (const variable of variables) {
    const groupEntry = Object.entries(ECV_CARACTERISTIC_GROUPS).find(([, entry]) =>
      entry.variables.includes(variable),
    )

    if (groupEntry) {
      const [groupKey, entry] = groupEntry
      if (emitted.has(groupKey)) continue
      emitted.add(groupKey)
      groups.push({
        key: groupKey,
        label: entry.label,
        series: entry.variables.map(v => ({
          key: v,
          label: ECV_CARACTERISTIC_VARIABLE_LABELS[v] ?? humanizeVariable(v),
        })),
      })
      continue
    }

    groups.push({
      key: variable,
      label: ECV_CARACTERISTIC_VARIABLE_LABELS[variable] ?? humanizeVariable(variable),
      series: [{ key: variable, label: ECV_CARACTERISTIC_VARIABLE_LABELS[variable] ?? humanizeVariable(variable) }],
    })
  }

  return groups
}

// Feeds the ECV characteristics chart from public/data/ecv_caracteristics.csv.
// Resolves rows for the scope implied by the ribbon (province zones -> province
// rows -> national), filtered to the selected year, and projects them onto one
// bar per area with the pct of each variable rooted in `values`. When a zone
// is selected, all of its province's zones are still shown, with the selected
// zone's bar flagged as `highlighted`.
export function useEcvCaracteristicsData(): EcvCaracteristicsData {
  const { ecvCaracteristics } = useData()
  const selectedYear = useDashboardStore(s => s.selectedYear)
  const selectedProvince = useDashboardStore(s => s.selectedProvince)
  const selectedZoneId = useDashboardStore(s => s.selectedZoneId)
  const zones = useZoneData(selectedProvince)

  return useMemo(() => {
    const zoneName = selectedZoneId
      ? zones.find(z => z.id === selectedZoneId)?.displayName ?? null
      : null
    const zoneKey = normalizeAreaName(zoneName)
    const provinceKey = normalizeAreaName(selectedProvince)

    const variables = Object.keys(ecvCaracteristics[0]?.values ?? [])
    const groups = buildGroups(variables)

    const rows = ecvCaracteristics.filter(r => r.year === selectedYear)

    const toBar = (row: EcvCaracteristicsRow, name: string, highlighted = false): EcvCaracteristicBar => {
      const values: Record<string, number | null> = {}
      for (const variable of variables) {
        values[variable] = row.values[variable]?.pct ?? null
      }
      return { name, values, highlighted }
    }

    let areaRows: EcvCaracteristicsRow[] = []
    let scopeLabel = 'national'

    if (provinceKey) {
      scopeLabel = zoneKey ? 'zone sélectionnée' : selectedProvince ?? ''
      areaRows = rows.filter(
        r => r.level === 'zone' && normalizeAreaName(r.province) === provinceKey,
      )
    } else {
      scopeLabel = 'national'
      areaRows = rows.filter(r => r.level === 'province')
    }

    const areas = areaRows.map(row =>
      toBar(
        row,
        (row.zone ?? row.province) as string,
        !!zoneKey && row.level === 'zone' && normalizeAreaName(row.zone) === zoneKey,
      ),
    )

    return { groups, areas, scopeLabel }
  }, [ecvCaracteristics, selectedYear, selectedProvince, selectedZoneId, zones])
}

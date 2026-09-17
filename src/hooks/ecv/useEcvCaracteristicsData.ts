import { useMemo } from 'react'
import { useData } from '@/context/DataContext'
import { useDashboardStore } from '@/store/dashboardStore'
import { normalizeAreaName, zoneJoinKey } from '@/lib/utils/ecvVaccCov'
import { useEcvScope } from './useEcvScope'
import {
  ECV_CARACTERISTIC_GROUPS,
  ECV_CARACTERISTIC_KEYS,
  ECV_CARACTERISTIC_VARIABLE_LABELS,
} from '@/lib/utils/constants'
import type { EcvCaracteristicValue, EcvCaracteristicsRow } from '@/types'

export interface EcvCaracteristicSeries {
  key: string
  label: string
}

export interface EcvCaracteristicGroup {
  key: string
  label: string
  series: EcvCaracteristicSeries[]
  // True when the series are the modalities of one question, so the stack
  // fills the bar to exactly 100%; false for the options of a multi-select
  // question, whose stacked height is a sum of overlapping answers and can
  // pass 100%. See ECV_CARACTERISTIC_GROUPS.
  exclusive: boolean
}

export interface EcvCaracteristicBar {
  name: string
  // Variable root -> pct with its optional 95% CI bounds (null when the
  // source cell was empty).
  values: Record<string, EcvCaracteristicValue>
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

function labelOf(variable: string): string {
  return ECV_CARACTERISTIC_VARIABLE_LABELS[variable] ?? humanizeVariable(variable)
}

// Builds the tab list from the charted variables (ECV_CARACTERISTIC_KEYS
// order). Variables sharing an ECV_CARACTERISTIC_GROUPS entry — the answers
// to one question — collapse into a single multi-series tab; every other
// variable becomes its own single-series tab. A group only keeps the
// variables the CSV actually carries, so a round missing a column still
// charts the rest.
function buildGroups(variables: string[]): EcvCaracteristicGroup[] {
  const groups: EcvCaracteristicGroup[] = []
  const emitted = new Set<string>()
  const charted = new Set(variables)

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
        exclusive: entry.exclusive,
        series: entry.variables
          .filter(v => charted.has(v))
          .map(v => ({ key: v, label: labelOf(v) })),
      })
      continue
    }

    groups.push({
      key: variable,
      label: labelOf(variable),
      exclusive: true,
      series: [{ key: variable, label: labelOf(variable) }],
    })
  }

  return groups
}

// Feeds the ECV characteristics chart from public/data/ecv_caracteristics.csv.
// Resolves rows for the scope implied by the ribbon (province zones -> province
// rows -> national), filtered to the selected year and milieu, and projects
// them onto one bar per area with the pct of each variable rooted in `values`.
// When a zone is selected, all of its province's zones are still shown, with
// the selected zone's bar flagged as `highlighted`. An area with no child of
// the selected milieu has no row, so it simply drops out of the chart.
//
// Zone rows are matched on the (province, zone) pair, never on the zone name
// alone: see zoneJoinKey.
export function useEcvCaracteristicsData(): EcvCaracteristicsData {
  const { ecvCaracteristics } = useData()
  const selectedYear = useDashboardStore(s => s.selectedYear)
  const selectedMilieu = useDashboardStore(s => s.selectedMilieu)
  const { provinceName, provinceKey, zoneKey } = useEcvScope()

  return useMemo(() => {
    // Whitelist + order the charted variables; the CSV may carry extra
    // `<root>_pct` families that this panel does not show.
    const available = new Set(Object.keys(ecvCaracteristics[0]?.values ?? {}))
    const variables = ECV_CARACTERISTIC_KEYS.filter(v => available.has(v))
    const groups = buildGroups(variables)

    const rows = ecvCaracteristics.filter(
      r => r.year === selectedYear && r.milieu === selectedMilieu,
    )

    const toBar = (row: EcvCaracteristicsRow, name: string, highlighted = false): EcvCaracteristicBar => {
      const values: Record<string, EcvCaracteristicValue> = {}
      for (const variable of variables) {
        values[variable] = row.values[variable] ?? { pct: null, low: null, high: null }
      }
      return { name, values, highlighted }
    }

    let areaRows: EcvCaracteristicsRow[] = []
    let scopeLabel = 'national'

    if (provinceKey) {
      scopeLabel = zoneKey ? 'zone sélectionnée' : provinceName ?? ''
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
        !!zoneKey &&
          row.level === 'zone' &&
          zoneJoinKey(row.province, row.zone) === zoneKey,
      ),
    )

    return { groups, areas, scopeLabel }
  }, [ecvCaracteristics, selectedYear, selectedMilieu, provinceName, provinceKey, zoneKey])
}

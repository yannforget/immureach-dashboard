import { useEffect, useMemo } from 'react'
import { useData } from '@/context/DataContext'
import { useDashboardStore } from '@/store/dashboardStore'
import { AGE_GROUPS, DEFAULT_AGE_GROUP } from '@/types'
import type { AgeGroup } from '@/types'

// Same guard as useAvailableMilieux, for the age filter: a coverage or
// characteristics CSV generated before the age split carries no `age_group`
// column and parses entirely as the default 6-23 window (see parseAgeGroup).
// Offering 6-11 / 12-23 against such a file would blank every chart, so the
// ribbon only lists the windows the loaded data actually holds.
//
// The windows are read for the selected year: ECV 2026 targeted 12-23 month
// olds and publishes no 6-11 estimate. Moving to such a year while 6-11 is
// selected falls back to the default window rather than blanking the charts.
//
// key_ecv.csv is deliberately not consulted: it is never split by age.
export function useAvailableAgeGroups(): AgeGroup[] {
  const { ecvVaccCov, ecvCaracteristics } = useData()
  const selectedYear = useDashboardStore(s => s.selectedYear)
  const selectedAgeGroup = useDashboardStore(s => s.selectedAgeGroup)
  const setSelectedAgeGroup = useDashboardStore(s => s.setSelectedAgeGroup)

  const ageGroups = useMemo(() => {
    const seen = new Set<AgeGroup>()
    for (const row of ecvVaccCov) if (row.year === selectedYear) seen.add(row.ageGroup)
    for (const row of ecvCaracteristics) if (row.year === selectedYear) seen.add(row.ageGroup)
    return AGE_GROUPS.filter(ageGroup => ageGroup === DEFAULT_AGE_GROUP || seen.has(ageGroup))
  }, [ecvVaccCov, ecvCaracteristics, selectedYear])

  useEffect(() => {
    if (!ageGroups.includes(selectedAgeGroup)) setSelectedAgeGroup(DEFAULT_AGE_GROUP)
  }, [ageGroups, selectedAgeGroup, setSelectedAgeGroup])

  return ageGroups
}

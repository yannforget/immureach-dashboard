import { useMemo } from 'react'
import { useData } from '@/context/DataContext'
import { AGE_GROUPS, DEFAULT_AGE_GROUP } from '@/types'
import type { AgeGroup } from '@/types'

// Same guard as useAvailableMilieux, for the age filter: a coverage or
// characteristics CSV generated before the age split carries no `age_group`
// column and parses entirely as the default 6-23 window (see parseAgeGroup).
// Offering 6-11 / 12-23 against such a file would blank every chart, so the
// ribbon only lists the windows the loaded data actually holds.
//
// key_ecv.csv is deliberately not consulted: it is never split by age.
export function useAvailableAgeGroups(): AgeGroup[] {
  const { ecvVaccCov, ecvCaracteristics } = useData()

  return useMemo(() => {
    const seen = new Set<AgeGroup>()
    for (const row of ecvVaccCov) seen.add(row.ageGroup)
    for (const row of ecvCaracteristics) seen.add(row.ageGroup)
    return AGE_GROUPS.filter(ageGroup => ageGroup === DEFAULT_AGE_GROUP || seen.has(ageGroup))
  }, [ecvVaccCov, ecvCaracteristics])
}

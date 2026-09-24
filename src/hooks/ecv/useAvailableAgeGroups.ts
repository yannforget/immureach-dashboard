import { useMemo } from 'react'
import { useData } from '@/context/DataContext'
import { AGE_GROUPS, DEFAULT_AGE_GROUP } from '@/types'
import type { AgeGroup } from '@/types'

// Mirrors useAvailableMilieux for the `vs25` age split: a file generated before
// it parses entirely as the default 6-24 group (see parseAgeGroup), so the
// ribbon only offers the age groups the loaded data actually holds and hides
// the filter when the answer is the default alone.
export function useAvailableAgeGroups(): AgeGroup[] {
  const { keyEcv, ecvVaccCov, ecvCaracteristics } = useData()

  return useMemo(() => {
    const seen = new Set<AgeGroup>()
    for (const row of keyEcv) seen.add(row.ageGroup)
    for (const row of ecvVaccCov) seen.add(row.ageGroup)
    for (const row of ecvCaracteristics) seen.add(row.ageGroup)
    return AGE_GROUPS.filter(group => group === DEFAULT_AGE_GROUP || seen.has(group))
  }, [keyEcv, ecvVaccCov, ecvCaracteristics])
}

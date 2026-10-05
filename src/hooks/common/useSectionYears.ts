import { useMemo } from 'react'
import { useData } from '@/context/DataContext'
import { useDashboardStore } from '@/store/dashboardStore'
import { DEFAULT_ECV_YEARS, DEFAULT_YEARS, sectionYears } from '@/lib/utils/years'
import type { Year } from '@/types'

// The profile sidecar lists the collection years the data was built for; the
// active section narrows that list (the zero-dose model is published for the
// latest year alone). DEFAULT_YEARS covers the render before profile.json has
// loaded — it is fetched non-fatally, like the ECV files.
//
// The ECV section is not built on the profile: it offers the survey rounds its
// own CSVs hold, which include rounds (2026) the model was never fitted on.
export function useSectionYears(): Year[] {
  const { profile, keyEcv, ecvVaccCov } = useData()
  const activeSection = useDashboardStore(s => s.activeSection)
  const available = profile?.years ?? DEFAULT_YEARS

  const ecvYears = useMemo(() => {
    const seen = new Set<Year>()
    for (const row of keyEcv) seen.add(row.year)
    for (const row of ecvVaccCov) seen.add(row.year as Year)
    return seen.size > 0 ? [...seen].sort((a, b) => a - b) : DEFAULT_ECV_YEARS
  }, [keyEcv, ecvVaccCov])

  return useMemo(
    () => (activeSection === 'ecv' ? ecvYears : sectionYears(activeSection, available)),
    [activeSection, available, ecvYears],
  )
}

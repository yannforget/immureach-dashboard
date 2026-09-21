import { useMemo } from 'react'
import { useData } from '@/context/DataContext'
import { useDashboardStore } from '@/store/dashboardStore'
import { DEFAULT_YEARS, sectionYears } from '@/lib/utils/years'
import type { Year } from '@/types'

// The profile sidecar lists the collection years the data was built for; the
// active section narrows that list (the zero-dose model is published for the
// latest year alone). DEFAULT_YEARS covers the render before profile.json has
// loaded — it is fetched non-fatally, like the ECV files.
export function useSectionYears(): Year[] {
  const { profile } = useData()
  const activeSection = useDashboardStore(s => s.activeSection)
  const available = profile?.years ?? DEFAULT_YEARS

  return useMemo(() => sectionYears(activeSection, available), [activeSection, available])
}

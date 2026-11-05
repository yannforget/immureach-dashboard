import { useMemo } from 'react'
import { useData } from '@/context/DataContext'
import { useDashboardStore } from '@/store/dashboardStore'
import { DEFAULT_YEARS, ECV_YEARS, sectionYears } from '@/lib/utils/years'
import type { Year } from '@/types'

// The profile sidecar lists the collection years the model data was built
// for; the ECV section instead offers every round its CSVs hold, which
// includes rounds (2026) the model does not cover. The active section then
// narrows that list (the zero-dose model is published for the latest year
// alone). DEFAULT_YEARS / ECV_YEARS cover the render before the files have
// loaded — they are fetched non-fatally.
export function useSectionYears(): Year[] {
  const { profile, keyEcv } = useData()
  const activeSection = useDashboardStore(s => s.activeSection)
  const profileYears = profile?.years ?? DEFAULT_YEARS

  const ecvYears = useMemo(() => {
    const seen = Array.from(new Set(keyEcv.map(r => r.year))).sort((a, b) => a - b)
    return seen.length > 0 ? seen : ECV_YEARS
  }, [keyEcv])

  const available = activeSection === 'ecv' ? ecvYears : profileYears

  return useMemo(() => sectionYears(activeSection, available), [activeSection, available])
}

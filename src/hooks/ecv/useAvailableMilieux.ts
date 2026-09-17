import { useMemo } from 'react'
import { useData } from '@/context/DataContext'
import { MILIEUX } from '@/types'
import type { Milieu } from '@/types'

// The milieu breakdown lives in the ECV CSVs, not in the dashboard: a file
// generated before the q108 split carries no `milieu` column and parses
// entirely as 'all' (see parseMilieu). Offering Urbain/Rural against such a
// file would yield an empty dashboard with no explanation, so the ribbon asks
// which milieux the loaded data actually holds and hides the filter when the
// answer is only 'all'.
//
// 'all' is always kept: it is the default selection, and the ribbon has to
// render even when the ECV files fail to load (they are fetched non-fatally).
export function useAvailableMilieux(): Milieu[] {
  const { keyEcv, ecvVaccCov, ecvCaracteristics } = useData()

  return useMemo(() => {
    const seen = new Set<Milieu>()
    for (const row of keyEcv) seen.add(row.milieu)
    for (const row of ecvVaccCov) seen.add(row.milieu)
    for (const row of ecvCaracteristics) seen.add(row.milieu)
    return MILIEUX.filter(milieu => milieu === 'all' || seen.has(milieu))
  }, [keyEcv, ecvVaccCov, ecvCaracteristics])
}

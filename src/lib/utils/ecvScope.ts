import { AGE_GROUP_LABELS, DEFAULT_AGE_GROUP, MILIEU_LABELS } from '@/types'
import type { AgeGroup, Milieu, ProfileScopeLevel } from '@/types'
import { normalizeAreaName, zoneJoinKey } from './ecvVaccCov'

// The ECV panels title themselves with the scope the ribbon has selected
// (national / a province / the selected zone). Since every ECV figure is now
// published per habitat as well, the habitat belongs in that title: without it
// a Kwilu urban chart and a Kwilu whole-sample chart are indistinguishable.
// 'all' is the default view, so it adds nothing.
export function withMilieu(scopeLabel: string, milieu: Milieu): string {
  return milieu === 'all' ? scopeLabel : `${scopeLabel} · ${MILIEU_LABELS[milieu]}`
}

// Same idea for download filenames, so an urbain export does not silently
// overwrite the whole-sample one in the browser's download folder.
export function milieuSlug(milieu: Milieu): string {
  return milieu === 'all' ? '' : `-${milieu}`
}

// Age group, same rule: the default 6-23 window is the whole sample the charts
// have always shown, so only a narrower window is spelled out.
export function withAgeGroup(scopeLabel: string, ageGroup: AgeGroup): string {
  return ageGroup === DEFAULT_AGE_GROUP ? scopeLabel : `${scopeLabel} · ${AGE_GROUP_LABELS[ageGroup]}`
}

export function ageGroupSlug(ageGroup: AgeGroup): string {
  return ageGroup === DEFAULT_AGE_GROUP ? '' : `-${ageGroup}m`
}

// The filters alone, for panels whose title carries no scope (the map).
// '' when neither narrows the default sample.
export function ecvFilterLabel(milieu: Milieu, ageGroup: AgeGroup): string {
  const parts: string[] = []
  if (milieu !== 'all') parts.push(MILIEU_LABELS[milieu])
  if (ageGroup !== DEFAULT_AGE_GROUP) parts.push(AGE_GROUP_LABELS[ageGroup])
  return parts.join(' · ')
}

interface ScopedEcvRow {
  year: number
  milieu: Milieu
  level: ProfileScopeLevel
  province: string | null
  zone: string | null
}

// Picks the single row of a per-domain ECV CSV (key_ecv.csv,
// indicators_ecv.csv) matching the ribbon's year, milieu, province and zone:
// the zone row when a zone is selected, else the province row, else the
// national one. A domain with no child of the selected milieu has no row at
// all, so the result is null and the cards read as empty rather than silently
// showing the whole-sample figure.
//
// Zone rows are matched on the (province, zone) pair, never on the zone name
// alone: see zoneJoinKey.
export function pickEcvScopeRow<T extends ScopedEcvRow>(
  rows: T[],
  year: number,
  milieu: Milieu,
  provinceKey: string,
  zoneKey: string,
): T | null {
  const candidates = rows.filter(r => r.year === year && r.milieu === milieu)
  if (zoneKey) {
    return candidates.find(r => r.level === 'zone' && zoneJoinKey(r.province, r.zone) === zoneKey) ?? null
  }
  if (provinceKey) {
    return candidates.find(r => r.level === 'province' && normalizeAreaName(r.province) === provinceKey) ?? null
  }
  return candidates.find(r => r.level === 'national') ?? null
}

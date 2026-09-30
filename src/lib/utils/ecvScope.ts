import { AGE_GROUP_LABELS, DEFAULT_AGE_GROUP, MILIEU_LABELS } from '@/types'
import type { AgeGroup, Milieu } from '@/types'

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

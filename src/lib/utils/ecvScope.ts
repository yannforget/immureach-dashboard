import { MILIEU_LABELS } from '@/types'
import type { Milieu } from '@/types'

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

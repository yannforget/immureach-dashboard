import type { EcvCaracteristicBar, EcvCaracteristicGroup, EcvLineData, IndicatorComparison } from '@/hooks'
import type { EcvBarItem } from '@/lib/charts/ecvBarOptions'
import type { AgeGroup, EcvVaccCovRow, Milieu, ZoneRow } from '@/types'
import { AGE_GROUP_LABELS, MILIEU_LABELS } from '@/types'
import { zoneJoinKey } from '@/lib/utils/ecvVaccCov'

function toSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function buildScopeSlug(province: string | null, zoneName: string | null): string {
  if (zoneName) return toSlug(zoneName)
  if (province) return toSlug(province)
  return 'national'
}

export function downloadDataUrl(url: string, filename: string): void {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export function downloadText(text: string, filename: string, mime: string): void {
  const blob = new Blob(['\ufeff', text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  downloadDataUrl(url, filename)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function csvNumber(value: number | null | undefined): string {
  return value == null ? '' : value.toFixed(1)
}

export interface EcvCsvScope {
  province: string | null
  zone: string | null
  ageGroup: AgeGroup
  milieu: Milieu
}

// `zoneKey` is a (province, zone) pair — zone names repeat across provinces,
// so the zone name alone would export a namesake's figures. See zoneJoinKey.
function findZoneRow(
  rows: EcvVaccCovRow[],
  year: number,
  ageGroup: AgeGroup,
  milieu: Milieu,
  zoneKey: string,
): EcvVaccCovRow | null {
  return (
    rows.find(
      r =>
        r.level === 'zone' &&
        r.year === year &&
        r.ageGroup === ageGroup &&
        r.milieu === milieu &&
        zoneJoinKey(r.province, r.zone) === zoneKey,
    ) ?? null
  )
}

export function buildEcvEvolutionCsv(
  data: EcvLineData,
  scope: EcvCsvScope,
  rows: EcvVaccCovRow[],
  zones: ZoneRow[],
): string {
  // `age_group` and `milieu` are columns of their own: the same province and
  // year appear once per age window and habitat, so a file without them cannot
  // be read back unambiguously.
  const header = ['year', 'age_group', 'milieu', 'province', 'zone']
  for (const s of data.series) {
    header.push(
      `${s.name} (%)`,
      `${s.name} (IC 95% bas)`,
      `${s.name} (IC 95% haut)`,
    )
  }

  const lines = [header.map(csvCell).join(',')]
  const includeZones = scope.zone === null && scope.province !== null

  const ageGroupLabel = AGE_GROUP_LABELS[scope.ageGroup]
  const milieuLabel = MILIEU_LABELS[scope.milieu]

  data.years.forEach((year, i) => {
    const cells = [
      String(year),
      csvCell(ageGroupLabel),
      csvCell(milieuLabel),
      csvCell(scope.province ?? ''),
      csvCell(scope.zone ?? ''),
    ]
    for (const s of data.series) {
      cells.push(csvNumber(s.values[i]), csvNumber(s.ciLow[i]), csvNumber(s.ciHigh[i]))
    }
    lines.push(cells.join(','))

    if (!includeZones) return
    for (const zone of zones) {
      const row = findZoneRow(
        rows,
        year,
        scope.ageGroup,
        scope.milieu,
        zoneJoinKey(zone.provinceId, zone.displayName),
      )
      const zoneCells = [
        String(year),
        csvCell(ageGroupLabel),
        csvCell(milieuLabel),
        csvCell(scope.province ?? ''),
        csvCell(zone.displayName),
      ]
      for (const s of data.series) {
        const m = row?.metrics[s.key]
        zoneCells.push(csvNumber(m?.pct ?? null), csvNumber(m?.ciLow ?? null), csvNumber(m?.ciHigh ?? null))
      }
      lines.push(zoneCells.join(','))
    }
  })

  return lines.join('\n')
}

export function buildEcvCaracteristicsCsv(
  group: EcvCaracteristicGroup,
  areas: EcvCaracteristicBar[],
): string {
  const header = ['area']
  for (const s of group.series) {
    header.push(
      `${s.label} (%)`,
      `${s.label} (IC 95% bas)`,
      `${s.label} (IC 95% haut)`,
    )
  }

  const lines = [header.map(csvCell).join(',')]
  for (const area of areas) {
    const cells = [csvCell(area.name)]
    for (const s of group.series) {
      const v = area.values[s.key]
      cells.push(csvNumber(v?.pct ?? null), csvNumber(v?.low ?? null), csvNumber(v?.high ?? null))
    }
    lines.push(cells.join(','))
  }

  return lines.join('\n')
}

export function buildEcvVaccineBarCsv(
  items: EcvBarItem[],
  scope: EcvCsvScope,
  year: number,
): string {
  const header = ['year', 'age_group', 'milieu', 'province', 'zone', 'vaccine', 'couverture (%)', 'IC 95% bas', 'IC 95% haut']
  const lines = [header.map(csvCell).join(',')]

  const ageGroupLabel = AGE_GROUP_LABELS[scope.ageGroup]
  const milieuLabel = MILIEU_LABELS[scope.milieu]

  // Same order as the chart reads top to bottom (highest coverage first).
  for (const item of [...items].reverse()) {
    lines.push([
      String(year),
      csvCell(ageGroupLabel),
      csvCell(milieuLabel),
      csvCell(scope.province ?? ''),
      csvCell(scope.zone ?? ''),
      csvCell(item.name),
      csvNumber(item.value),
      csvNumber(item.ciLow),
      csvNumber(item.ciHigh),
    ].join(','))
  }

  return lines.join('\n')
}

function csvDecimal(value: number | null | undefined, digits: number): string {
  return value == null ? '' : value.toFixed(digits)
}

export function buildBehaviourIndicatorsCsv(comparison: IndicatorComparison, year: number): string {
  // `niveau` records the level the values actually come from, which can be a
  // fallback (e.g. province) when the requested zone has no survey data.
  const header = [
    'year', 'niveau', 'zone', 'indicateur', 'categorie',
    'vaccine (0-1)', 'zero-dose (0-1)', 'ecart (0-dose - vacc)',
    'vaccine (brut)', 'zero-dose (brut)',
  ]
  const lines = [header.map(csvCell).join(',')]

  // Same order as the chart reads top to bottom.
  for (const r of comparison.items) {
    lines.push([
      String(year),
      csvCell(comparison.scopeLevel),
      csvCell(comparison.scopeLabel),
      csvCell(r.label),
      csvCell(r.category ?? ''),
      csvDecimal(r.vacc, 3),
      csvDecimal(r.zd, 3),
      csvDecimal(r.gap, 3),
      csvDecimal(r.vaccRaw, 3),
      csvDecimal(r.zdRaw, 3),
    ].join(','))
  }

  return lines.join('\n')
}

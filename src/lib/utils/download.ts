import type { EcvCaracteristicBar, EcvCaracteristicGroup, EcvLineData } from '@/hooks'
import type { EcvVaccCovRow, ZoneRow } from '@/types'
import { normalizeAreaName } from '@/lib/utils/ecvVaccCov'

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
}

function findZoneRow(
  rows: EcvVaccCovRow[],
  year: number,
  provinceKey: string,
  zoneKey: string,
): EcvVaccCovRow | null {
  return (
    rows.find(
      r =>
        r.level === 'zone' &&
        r.year === year &&
        normalizeAreaName(r.province) === provinceKey &&
        normalizeAreaName(r.zone) === zoneKey,
    ) ?? null
  )
}

export function buildEcvEvolutionCsv(
  data: EcvLineData,
  scope: EcvCsvScope,
  rows: EcvVaccCovRow[],
  zones: ZoneRow[],
): string {
  const header = ['year', 'province', 'zone']
  for (const s of data.series) {
    header.push(
      `${s.name} (%)`,
      `${s.name} (IC 95% bas)`,
      `${s.name} (IC 95% haut)`,
    )
  }

  const lines = [header.map(csvCell).join(',')]
  const provinceKey = normalizeAreaName(scope.province)
  const includeZones = scope.zone === null && scope.province !== null

  data.years.forEach((year, i) => {
    const cells = [String(year), csvCell(scope.province ?? ''), csvCell(scope.zone ?? '')]
    for (const s of data.series) {
      cells.push(csvNumber(s.values[i]), csvNumber(s.ciLow[i]), csvNumber(s.ciHigh[i]))
    }
    lines.push(cells.join(','))

    if (!includeZones) return
    for (const zone of zones) {
      const row = findZoneRow(rows, year, provinceKey, normalizeAreaName(zone.displayName))
      const zoneCells = [String(year), csvCell(scope.province ?? ''), csvCell(zone.displayName)]
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

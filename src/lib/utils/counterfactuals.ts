import { parseCsv } from '@/lib/utils/csv'
import type { CounterfactualRow, CounterfactualScenario, DeterminantCategory } from '@/types'

// Levers each scenario may change, as documented in the counterfactual
// readme. Only these are counted for a scenario: the export also reports a few
// travel-time changes under `indiv`, which the readme does not list there.
export const SCENARIO_LEVERS: Record<CounterfactualScenario, string[]> = {
  hcs: ['missed_opportunities', 'outreach', 'Y0_min', 'ai_vaccine_dose', 'ai_workforce'],
  indiv: ['opinion_on_vaccines', 'self_efficacy', 'knowledge_diseases', 'knowledge_vaccines'],
}

const ALL_LEVERS = [...SCENARIO_LEVERS.hcs, ...SCENARIO_LEVERS.indiv]

export const SCENARIO_LABELS: Record<CounterfactualScenario, string> = {
  hcs: 'Système sanitaire',
  indiv: 'Facteurs individuels',
}

export const SCENARIO_DESCRIPTIONS: Record<CounterfactualScenario, string> = {
  hcs: "Offre : opportunités manquées, sensibilisation, temps de trajet, doses et personnel disponibles.",
  indiv: 'Demande : opinion sur les vaccins, confiance en sa capacité, connaissances des maladies et des vaccins.',
}

// COM-B category of each lever, matching covariates_description.csv. Travel
// time is not in that file; it is an access variable, hence Opportunity.
export const LEVER_CATEGORIES: Record<string, DeterminantCategory> = {
  missed_opportunities: 'Opportunity',
  outreach: 'Opportunity',
  Y0_min: 'Opportunity',
  ai_vaccine_dose: 'Opportunity',
  ai_workforce: 'Opportunity',
  opinion_on_vaccines: 'Motivation',
  self_efficacy: 'Motivation',
  knowledge_diseases: 'Capacity',
  knowledge_vaccines: 'Capacity',
}

// Fallback labels for levers absent from covariates_description.csv.
export const LEVER_FALLBACK_LABELS: Record<string, string> = {
  Y0_min: 'Temps de trajet (min)',
}

// Province names come prefixed ("ks_Kasai"); keep the dashboard spelling.
function cleanProvince(raw: string): string {
  return raw.replace(/^[a-z]{2}_/, '').replace(/_/g, ' ')
}

export function parseCounterfactualsCsv(text: string): CounterfactualRow[] {
  return parseCsv(text).map(r => {
    const province = cleanProvince(r.province)
    const levers: Record<string, number> = {}
    for (const lever of ALL_LEVERS) {
      const v = r[lever]
      if (v !== undefined && v !== '' && v !== 'NA') levers[lever] = Number(v)
    }
    return {
      scenario: r.scenario as CounterfactualScenario,
      childId: `${province}-${r.id_sample_in_province}`,
      province,
      delta: Number(r.delta),
      predFinal: Number(r.pred0_final),
      predInitial: Number(r.pred0_initial),
      levers,
    }
  })
}

export function counterfactualProvinces(rows: CounterfactualRow[]): string[] {
  return [...new Set(rows.map(r => r.province))].sort()
}

// One child with both scenarios side by side. Children missing one scenario
// are left out: they cannot be compared.
export interface CounterfactualChild {
  childId: string
  province: string
  predInitial: number
  hcs: CounterfactualRow
  indiv: CounterfactualRow
}

export function pairChildren(rows: CounterfactualRow[]): CounterfactualChild[] {
  const byChild = new Map<string, Partial<Record<CounterfactualScenario, CounterfactualRow>>>()
  for (const r of rows) {
    const entry = byChild.get(r.childId) ?? {}
    entry[r.scenario] = r
    byChild.set(r.childId, entry)
  }

  const children: CounterfactualChild[] = []
  for (const [childId, { hcs, indiv }] of byChild) {
    if (!hcs || !indiv) continue
    children.push({
      childId,
      province: hcs.province,
      predInitial: hcs.predInitial,
      hcs,
      indiv,
    })
  }
  return children
}

export interface ScenarioSummary {
  scenario: CounterfactualScenario
  n: number
  meanInitial: number
  meanFinal: number
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function summariseScenario(
  rows: CounterfactualRow[],
  scenario: CounterfactualScenario,
): ScenarioSummary {
  const sc = rows.filter(r => r.scenario === scenario)
  return {
    scenario,
    n: sc.length,
    meanInitial: mean(sc.map(r => r.predInitial)),
    meanFinal: mean(sc.map(r => r.predFinal)),
  }
}

export interface LeverUsage {
  lever: string
  scenario: CounterfactualScenario
  // Share (0-1) of the children of the scope whose lever was changed.
  share: number
  count: number
  // Median change applied, among those children.
  medianChange: number
}

export function leverUsage(children: CounterfactualChild[]): LeverUsage[] {
  const usage: LeverUsage[] = []
  for (const scenario of ['hcs', 'indiv'] as CounterfactualScenario[]) {
    for (const lever of SCENARIO_LEVERS[scenario]) {
      const changes = children
        .map(c => c[scenario].levers[lever])
        .filter((v): v is number => v !== undefined)
      usage.push({
        lever,
        scenario,
        count: changes.length,
        share: children.length === 0 ? 0 : changes.length / children.length,
        medianChange: median(changes),
      })
    }
  }
  return usage.sort((a, b) => b.share - a.share)
}

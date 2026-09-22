import type { DashboardSection, Year } from '@/types';

// Every dataset is labelled with the year the ECV survey was collected. The
// source exports in data/input/ecv/ are named after the year they were
// produced, one year earlier, and the pipeline shifts them on the way out.
export const DEFAULT_YEARS: Year[] = [2023, 2024];

// Sections that only publish a subset of the collected years. The zero-dose
// model is fitted on the latest survey alone, so offering the older year there
// would point the maps and cards at data the model does not cover.
const SECTION_YEARS: Partial<Record<DashboardSection, Year[]>> = {
  zerodose: [2024],
};

/** Years the ribbon offers on a section, ordered as the profile lists them. */
export function sectionYears(section: DashboardSection, available: Year[]): Year[] {
  const allowed = SECTION_YEARS[section];
  if (!allowed) return available;
  const kept = available.filter((year) => allowed.includes(year));
  return kept.length > 0 ? kept : allowed;
}

/**
 * Year to select on a section, keeping the current one whenever that section
 * publishes it. Called when the section changes so a restricted section never
 * renders against a year it has no data for.
 */
export function resolveSectionYear(section: DashboardSection, current: Year): Year {
  const allowed = SECTION_YEARS[section];
  if (!allowed || allowed.includes(current)) return current;
  return allowed[allowed.length - 1];
}

/** Ribbon caption for the year filter. */
export function yearLabel(section: DashboardSection): string {
  // On ECV the distinction matters: the numbers are named after the year the
  // survey went to the field, not the year the source export was cut.
  return section === 'ecv' ? 'Année de collecte' : 'Année';
}

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

// Sections whose results describe a later year than the survey they are
// computed from. The zero-dose model is fitted on the 2024 survey and predicts
// the 2025 cohort, so the ribbon shows 2025 while the data stays keyed by 2024.
const SECTION_YEAR_DISPLAY_OFFSET: Partial<Record<DashboardSection, number>> = {
  zerodose: 1,
};

/** Year as the ribbon displays it on a section. */
export function displayYear(section: DashboardSection, year: Year): string {
  return String(year + (SECTION_YEAR_DISPLAY_OFFSET[section] ?? 0));
}

/** Ribbon caption for the year filter. */
export function yearLabel(section: DashboardSection): string {
  // On ECV the distinction matters: the numbers are named after the year the
  // survey went to the field, not the year the source export was cut.
  return section === 'ecv' ? 'Année de collecte' : 'Année';
}

/** Help text shown next to the year filter, or undefined when none is needed. */
export function yearInfo(section: DashboardSection): string | undefined {
  // The ECV survey measures the cohort born the year before collection, which
  // is easy to misread from the year label alone.
  // On the zero-dose model, the ribbon year is the survey the model is fitted
  // on, not the cohort and year its predictions describe.
  if (section === 'ecv') {
    return "L'enquête de l'année sélectionnée cherche à estimer le statut vaccinal de la cohorte d'enfants née l'année précédente.";
  }
  if (section === 'zerodose') {
    return "Résultats prédits sur la cohorte 6-11 mois pour l'année 2025.";
  }
  return undefined;
}

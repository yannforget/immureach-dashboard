import { create } from 'zustand';
import type { AgeGroup, DashboardSection, Milieu, MetricKey, ViewMode, Year } from '@/types';
import { DEFAULT_AGE_GROUP } from '@/types';
import { MODEL_METRIC_KEYS } from '@/lib/utils/constants';
import { resolveSectionYear } from '@/lib/utils/years';

interface DashboardState {
  // Top-level ribbon tab.
  activeSection: DashboardSection;

  // Selection state
  selectedMetric: MetricKey;
  selectedProvince: string | null;
  selectedZoneId: string | null;
  hoveredZoneId: string | null;

  // Lower-panel mode + the year shown in profiling charts.
  viewMode: ViewMode;
  selectedYear: Year;

  // ECV habitat filter (survey question q108). Only the ECV datasets are
  // published per milieu, so this is inert outside the ECV section.
  selectedMilieu: Milieu;

  // ECV child-age filter (survey question vs25, months). Same scope as the
  // milieu: inert outside the ECV section.
  selectedAgeGroup: AgeGroup;

  // Map-only Antenne overlay (purely visual; resets when province changes).
  showAntenne: boolean;

  // Actions
  setActiveSection: (section: DashboardSection) => void;
  setMetric: (metric: MetricKey) => void;
  setProvince: (province: string | null) => void;
  setSelectedZone: (zoneId: string | null) => void;
  setHoveredZone: (zoneId: string | null) => void;
  setViewMode: (mode: ViewMode) => void;
  setSelectedYear: (year: Year) => void;
  setSelectedMilieu: (milieu: Milieu) => void;
  setSelectedAgeGroup: (ageGroup: AgeGroup) => void;
  setShowAntenne: (show: boolean) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  activeSection: 'ecv',
  selectedMetric: MODEL_METRIC_KEYS[0],
  selectedProvince: null,
  selectedZoneId: null,
  hoveredZoneId: null,
  viewMode: 'data',
  selectedYear: 2023,
  selectedMilieu: 'all',
  selectedAgeGroup: DEFAULT_AGE_GROUP,
  showAntenne: true,

  // Sections do not all publish every year (the zero-dose model covers the
  // latest one only), so the selection follows the section.
  setActiveSection: (section) =>
    set((state) => ({
      activeSection: section,
      selectedYear: resolveSectionYear(section, state.selectedYear),
    })),

  setMetric: (metric) => set({ selectedMetric: metric }),

  setProvince: (province) =>
    set({
      selectedProvince: province,
      selectedZoneId: null,
      showAntenne: false,
    }),

  setSelectedZone: (zoneId) => set({ selectedZoneId: zoneId }),

  setHoveredZone: (zoneId) => set({ hoveredZoneId: zoneId }),

  setViewMode: (mode) => set({ viewMode: mode }),

  setSelectedYear: (year) => set({ selectedYear: year }),

  setSelectedMilieu: (milieu) => set({ selectedMilieu: milieu }),

  setSelectedAgeGroup: (ageGroup) => set({ selectedAgeGroup: ageGroup }),

  setShowAntenne: (show) => set({ showAntenne: show }),
}));

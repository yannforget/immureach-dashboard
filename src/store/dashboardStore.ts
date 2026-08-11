import { create } from 'zustand';
import type { DashboardSection, MetricKey, ViewMode, Year } from '@/types';
import { MODEL_METRIC_KEYS } from '@/lib/utils/constants';

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
  setShowAntenne: (show: boolean) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  activeSection: 'ecv',
  selectedMetric: MODEL_METRIC_KEYS[0],
  selectedProvince: null,
  selectedZoneId: null,
  hoveredZoneId: null,
  viewMode: 'data',
  selectedYear: 2022,
  showAntenne: true,

  setActiveSection: (section) => set({ activeSection: section }),

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

  setShowAntenne: (show) => set({ showAntenne: show }),
}));

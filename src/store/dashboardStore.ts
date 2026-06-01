import { create } from 'zustand';
import type { MetricKey, ViewMode, Year } from '@/types';
import { METRIC_KEYS } from '@/lib/dataUtils';

interface DashboardState {
  // Selection state
  selectedMetric: MetricKey;
  selectedProvince: string | null;
  selectedZoneId: string | null;
  hoveredZoneId: string | null;

  // Lower-panel mode + the year shown in profiling charts.
  viewMode: ViewMode;
  selectedYear: Year;

  // Actions
  setMetric: (metric: MetricKey) => void;
  setProvince: (province: string | null) => void;
  setSelectedZone: (zoneId: string | null) => void;
  setHoveredZone: (zoneId: string | null) => void;
  setViewMode: (mode: ViewMode) => void;
  setSelectedYear: (year: Year) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  selectedMetric: METRIC_KEYS[0],
  selectedProvince: null,
  selectedZoneId: null,
  hoveredZoneId: null,
  viewMode: 'data',
  selectedYear: 2023,

  setMetric: (metric) => set({ selectedMetric: metric }),

  setProvince: (province) =>
    set({
      selectedProvince: province,
      selectedZoneId: null,
    }),

  setSelectedZone: (zoneId) => set({ selectedZoneId: zoneId }),

  setHoveredZone: (zoneId) => set({ hoveredZoneId: zoneId }),

  setViewMode: (mode) => set({ viewMode: mode }),

  setSelectedYear: (year) => set({ selectedYear: year }),
}));

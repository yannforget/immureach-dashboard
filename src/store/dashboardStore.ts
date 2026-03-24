import { create } from 'zustand';
import type { MetricKey } from '@/types';
import { METRIC_KEYS } from '@/lib/dataUtils';

interface DashboardState {
  // Selection state
  selectedMetric: MetricKey;
  selectedProvince: string | null;
  selectedZoneId: string | null;
  hoveredZoneId: string | null;
  showAntennes: boolean;

  // Actions
  setMetric: (metric: MetricKey) => void;
  setProvince: (province: string | null) => void;
  setSelectedZone: (zoneId: string | null) => void;
  setHoveredZone: (zoneId: string | null) => void;
  setShowAntennes: (show: boolean) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  selectedMetric: METRIC_KEYS[0],
  selectedProvince: null,
  selectedZoneId: null,
  hoveredZoneId: null,
  showAntennes: false,

  setMetric: (metric) => set({ selectedMetric: metric }),

  setProvince: (province) =>
    set({
      selectedProvince: province,
      selectedZoneId: null,
      showAntennes: false,
    }),

  setSelectedZone: (zoneId) => set({ selectedZoneId: zoneId }),

  setHoveredZone: (zoneId) => set({ hoveredZoneId: zoneId }),

  setShowAntennes: (show) => set({ showAntennes: show }),
}));

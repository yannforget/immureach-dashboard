import React from 'react';
import { AccessibilityChart } from './charts/AccessibilityChart'
import { DumbbellChart } from './charts/DumbbellChart'

export function ProfilingPanel() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="h-96 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <AccessibilityChart />
      </div>
      <div className="h-96 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <DumbbellChart />
      </div>
    </div>
  )
}

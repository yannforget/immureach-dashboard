import { ModelAccessibilityChart } from './charts/ModelAccessibilityChart'

export function ProfilingPanel() {
  return (
    <div className="h-96 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <ModelAccessibilityChart />
    </div>
  )
}

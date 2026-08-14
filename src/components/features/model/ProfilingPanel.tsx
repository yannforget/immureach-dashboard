import { ModelAccessibilityChart } from './charts/ModelAccessibilityChart'
import { ModelDumbbellChart } from './charts/ModelDumbbellChart'

export function ProfilingPanel() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="h-96 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <ModelAccessibilityChart />
      </div>
      <div className="h-96 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <ModelDumbbellChart />
      </div>
    </div>
  )
}

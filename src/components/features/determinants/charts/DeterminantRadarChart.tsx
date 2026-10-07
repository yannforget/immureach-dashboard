import ReactECharts from 'echarts-for-react'
import { useMemo } from 'react'
import { useDeterminantData } from '@/hooks'
import { buildDeterminantRadarOptions } from '@/lib/charts/determinantRadarOptions'

export function DeterminantRadarChart() {
  const { variables } = useDeterminantData()

  const option = useMemo(
    () => buildDeterminantRadarOptions({ variables }),
    [variables]
  )

  return (
    <ReactECharts
      option={option}
      theme="dashboard"
      notMerge
      style={{ height: '100%', width: '100%' }}
    />
  )
}

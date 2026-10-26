import { useEffect, useRef, type RefObject } from 'react'
import type EChartsReact from 'echarts-for-react'

// Mirrors the store's `hoveredZoneId` onto the map as the shape's `emphasis`
// style, so hovering a bar in the bar chart lights up the matching geometry —
// the same look as hovering the shape itself.
//
// Like useMapSelectionSync, this goes through dispatchAction rather than the
// option: emphasis is transient series state, and rebuilding the option on
// every hover would redraw the whole map.
//
// `hoveredMapKey` is the raw, province-prefixed boundary name (mapKey).
// `chartKey` is the component's remount key: a remount drops the emphasis, so
// the effect re-dispatches after one.
export function useMapHoverSync(
  chartRef: RefObject<EChartsReact | null>,
  hoveredMapKey: string | null,
  chartKey: string,
) {
  const previousMapKey = useRef<string | null>(null)

  useEffect(() => {
    const chart = chartRef.current?.getEchartsInstance()
    if (!chart) return

    if (previousMapKey.current && previousMapKey.current !== hoveredMapKey) {
      chart.dispatchAction({ type: 'downplay', seriesIndex: 0, name: previousMapKey.current })
    }
    if (hoveredMapKey) {
      chart.dispatchAction({ type: 'highlight', seriesIndex: 0, name: hoveredMapKey })
    }
    previousMapKey.current = hoveredMapKey
  }, [chartRef, hoveredMapKey, chartKey])
}

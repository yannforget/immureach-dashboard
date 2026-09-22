import { useEffect, useRef, type RefObject } from 'react'
import type EChartsReact from 'echarts-for-react'

// Paints the zone picked in the ribbon with the map's yellow `select` style —
// the very style a click on a geometry produces, so both routes to a selection
// look the same.
//
// Selection cannot be declared in the option we rebuild on every store change:
// a data item's `selected` flag is only read while the series has no
// `selectedMap` yet (Series._initSelectedMapFromData), so the first click on a
// shape would freeze it for good. It lives in the series model instead, driven
// by dispatchAction — the same store-coordinated pattern the other charts use.
//
// `selectedMapKey` is the raw, province-prefixed boundary name (mapKey), not
// the cleaned displayName, because zone names repeat across provinces.
//
// `chartKey` is the component's remount key: a remount builds a fresh series
// model with no selection, so the effect has to re-dispatch after one.
export function useMapSelectionSync(
  chartRef: RefObject<EChartsReact | null>,
  selectedMapKey: string | null,
  chartKey: string,
) {
  const previousMapKey = useRef<string | null>(null)

  useEffect(() => {
    const chart = chartRef.current?.getEchartsInstance()
    if (!chart) return

    // `selectedMode: 'single'` already drops the previous shape when a new one
    // is selected; the explicit unselect is what clears the map when the
    // ribbon goes back to "Toutes".
    if (previousMapKey.current && previousMapKey.current !== selectedMapKey) {
      chart.dispatchAction({ type: 'unselect', seriesIndex: 0, name: previousMapKey.current })
    }
    if (selectedMapKey) {
      chart.dispatchAction({ type: 'select', seriesIndex: 0, name: selectedMapKey })
    }
    previousMapKey.current = selectedMapKey
  }, [chartRef, selectedMapKey, chartKey])
}

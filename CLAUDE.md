We are building a modern dashboard to demonstrate how to use ImmuReach data to plan vaccination campaigns.

# Dashboard Layout

## 1. Header

- Dashboard title: "ImmuReach"
- Subtitle: "Reaching Missed Communities in DRC"

## 2. Province Selector

- A row of buttons to choose which province to view
- Options: "All" or specific province names (Kwilu, Kasai, Lomami, Sankuru)
- Only one province is selected at a time

## 3. Indicators

- A horizontal row of cards showing key statistics
- 8 different immunization metrics, each card displays:
  - Metric name (e.g., BCG, Measles, Polio)
  - Coverage percentage
  - Number of children vaccinated (or 0-dose)
- Clicking a card selects that metric for the charts below

### Main charts (two side-by-side)

Left: Coverage map

- Geographic map showing coverage by zone or province depending on which is selected
- Color intensity represents coverage level
- Small legend showing the colorscale
- Colorscale always use multiple of ten for min & max
- Clicking on a province select it (same as province selector)
- Clicking on a zone select it
- Hovering over a zone highlights its corresponding bar on the horizontal bar chart

Right: Horizontal bar chart

- Horizontal bar chart showing ALL provinces ("all" selected) or zones in the provinces (province selected)
- If showing zones, toggle button to show where antennes are located (binary choropleth)
- Hovering over a zone highlights its corresponding shape in the coverage map
- Descending order (widest bars at the top)

### 5. Data table

- Table showing detailed metrics for the selected area
- Three modes depending on what's selected:
  - Province level: All provinces with their metrics
  - Zone level: All zones within selected province
  - Zone detail: Deep dive into one specific zone
- Click on a zone name to drill down into details
- "Back" link appears when viewing zone details

## Interaction Flow

1. Select a province from the buttons
   - Dashboard updates to show only that province's zones
2. Select a metric from the cards
   - Map and bar chart update to show that metric
3. Change bar chart view with toggle buttons
   - Bar chart switches between coverage %, child counts, or births
4. Click a zone on the map or in the table
   - Table switches to show detailed data for that zone
5. Click "Back" in the table
   - Returns to viewing all zones in the province

# Tech Stack

- Core: React, TypeScript, Vite.
- Styling: Tailwind + shadcn/ui for non-chart UI
- Charts: ECharts via echarts-for-react
- Client state: Zustand (great for shared filters across charts)
- Layout: CSS Grid via Tailwind

## ECharts Conventions

- Never define option objects inline in JSX - always use useMemo or option factory functions
- Option factories live in src/lib/charts/ and accept typed data + config, return EChartsOption
- All charts use our custom theme registered via echarts.registerTheme('dashboard', {...})
- Coordinate linked charts via Zustand store, not prop drilling
- Use getEchartsInstance().dispatchAction() for programmatic cross-chart interactions

# Don't

- Do not use Chart.js, Recharts, or any other chart library - ECharts only
- Do not install CSS-in-JS libraries - Tailwind only
- Do not create global CSS files except for ECharts theme overrides
- Do not put business logic in components - extract to hooks or utils
- Do not hardcode colors in chart options — use theme palette

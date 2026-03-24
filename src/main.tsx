import React from 'react'
import ReactDOM from 'react-dom/client'
import * as echarts from 'echarts'
import App from './App'
import './index.css'
import { DASHBOARD_THEME } from './lib/charts/theme'

// Register ECharts theme
echarts.registerTheme('dashboard', DASHBOARD_THEME)

// Render app - GeoJSON loading is handled by DataContext
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

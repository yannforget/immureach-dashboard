import { DataProvider } from './context/DataContext'
import { Header } from './components/layout/Header'
import { DashboardGrid } from './components/layout/DashboardGrid'

export default function App() {
  return (
    <DataProvider>
      <div className="min-h-screen bg-slate-50">
        <Header />
        <DashboardGrid />
      </div>
    </DataProvider>
  )
}

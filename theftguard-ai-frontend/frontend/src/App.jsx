import { Navigate, Route, Routes } from 'react-router-dom'
import PublicLayout from './components/PublicLayout'
import AppShell from './components/AppShell'
import ProtectedRoute from './components/ProtectedRoute'
import Landing from './pages/Landing'
import SignIn from './pages/SignIn'
import Dashboard from './pages/Dashboard'
import Screening from './pages/Screening'
import Results from './pages/Results'
import Comparison from './pages/Comparison'
import Investigations from './pages/Investigations'
import Reports from './pages/Reports'
import BillUpload from './pages/BillUpload'
import BillComparison from './pages/BillComparison'
import ModelInfo from './pages/ModelInfo'
import AIChatWorkspace from './pages/AIChatWorkspace'
import Settings from './pages/Settings'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/signin" element={<SignIn />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route path="/app" element={<AppShell />}>
          <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="screening" element={<Screening />} />
        <Route path="results" element={<Results />} />
        <Route path="comparison" element={<Comparison />} />
        <Route path="bill-upload" element={<BillUpload />} />
        <Route path="bill-comparison" element={<BillComparison />} />
        <Route path="investigations" element={<Investigations />} />
        <Route path="reports" element={<Reports />} />
        <Route path="chat" element={<AIChatWorkspace />} />
        <Route path="model" element={<ModelInfo />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

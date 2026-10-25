import { getAuthStatus } from './api'
import { useAsync } from './hooks'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { LeaguePage } from './pages/LeaguePage'
import { LeaguesPage } from './pages/LeaguesPage'
import { LoginPage } from './pages/LoginPage'
import { ProfilePage } from './pages/ProfilePage'
import { SnipePage } from './pages/SnipePage'

function RequireSession() {
  const status = useAsync(getAuthStatus, [])
  if (status.loading) return <p className="muted">Checking your session…</p>
  if (status.error) return <p className="error" role="alert">{status.error}</p>
  return status.data?.authenticated ? <Outlet /> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireSession />}>
        {/* Full-screen camera, no tab bar. Opening the app lands here. */}
        <Route path="/snipe" element={<SnipePage />} />
        <Route element={<AppShell />}>
          <Route path="/leagues" element={<LeaguesPage />} />
          <Route path="/leagues/:leagueId" element={<LeaguePage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
        </Route>
        <Route path="/" element={<Navigate to="/leagues" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

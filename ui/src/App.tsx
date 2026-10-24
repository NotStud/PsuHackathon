import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { LeaguePage } from './pages/LeaguePage'
import { LeaguesPage } from './pages/LeaguesPage'
import { LoginPage } from './pages/LoginPage'
import { ProfilePage } from './pages/ProfilePage'
import { SnipePage } from './pages/SnipePage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        {/* Full-screen camera, no tab bar. Opening the app lands here. */}
        <Route path="/snipe" element={<SnipePage />} />
        <Route element={<AppShell />}>
          <Route path="/leagues" element={<LeaguesPage />} />
          <Route path="/leagues/:leagueId" element={<LeaguePage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
        <Route path="/" element={<Navigate to="/snipe" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

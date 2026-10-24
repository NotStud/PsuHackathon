import { NavLink, Outlet } from 'react-router-dom'
import { CrosshairIcon, TrophyIcon, UserIcon } from './Icons'

/** Layout for signed-in screens: page content plus the bottom tab bar. */
export function AppShell() {
  return (
    <div className="shell">
      <main className="shell-content">
        <Outlet />
      </main>
      <nav className="tabbar" aria-label="Main">
        <NavLink to="/leagues" className="tab">
          <TrophyIcon />
          <span>Leagues</span>
        </NavLink>
        <NavLink to="/snipe" className="tab tab-snipe" aria-label="Snipe">
          <span className="tab-snipe-button">
            <CrosshairIcon width={30} height={30} />
          </span>
        </NavLink>
        <NavLink to="/profile" className="tab">
          <UserIcon />
          <span>Profile</span>
        </NavLink>
      </nav>
    </div>
  )
}

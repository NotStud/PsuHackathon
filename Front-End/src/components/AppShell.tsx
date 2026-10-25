import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { CrosshairIcon, LeaguesIcon, UserIcon } from './Icons'

/** Layout for signed-in screens: page content plus the bottom tab bar. */
export function AppShell() {
  const { pathname } = useLocation()
  return (
    <div className={`shell${pathname === "/profile" ? " shell-profile" : ""}`}>
      <main className="shell-content">
        <Outlet />
      </main>
      <nav className="tabbar" aria-label="Main">
        <NavLink to="/leagues" className="tab">
          <LeaguesIcon />
          <span>Leagues</span>
        </NavLink>
        <NavLink to="/snipe" className="tab tab-snipe" aria-label="Sniper camera">
          <span className="tab-snipe-button">
            <CrosshairIcon width={30} height={30} />
          </span>
          <span>Sniper</span>
        </NavLink>
        <NavLink to="/profile" className="tab">
          <UserIcon />
          <span>Profile</span>
        </NavLink>
      </nav>
    </div>
  )
}

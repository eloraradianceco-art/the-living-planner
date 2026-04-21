import { Link, useLocation } from 'react-router-dom'
import { formatDateLabel, TODAY } from '../utils/date'
import { useResponsive } from '../hooks/useResponsive'

const tabs = [
  { to: '/', label: 'Home', icon: '⌂' },
  { to: '/tasks', label: 'Tasks', icon: '✓' },
  { to: '/calendar', label: 'Calendar', icon: '◷' },
  { to: '/projects', label: 'Projects', icon: '◈' },
  { to: '/growth', label: 'Growth', icon: '↑' },
  { to: '/more', label: 'More', icon: '⋯' },
]

export default function Layout({ children, onQuickAdd, banner, profile }) {
  const location = useLocation()
  const displayName = profile?.displayName || 'Planner'
  const { isDesktop, isMobile } = useResponsive()

  return (
    <div className="app-shell premium-shell living-planner-shell">
      <header className="topbar premium-topbar living-planner-topbar">
        <div className="topbar-copy">
          <p className="eyebrow">The Living Planner</p>
          <h1>The Living Planner</h1>
          <p className="muted topbar-date">{formatDateLabel(TODAY, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>

        <div className="topbar-actions">
          <div className="profile-pill">
            <span className="profile-avatar">{displayName.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{displayName}</strong>
              <span>{profile?.plannerMode || 'Balanced'} mode</span>
            </div>
          </div>
          <button className="primary-btn premium-btn" onClick={onQuickAdd}>
            {isMobile ? '＋' : 'Quick Add'}
          </button>
        </div>
      </header>

      {banner}

      <div className={isDesktop ? 'app-frame desktop-frame' : 'app-frame'}>
        {isDesktop ? (
          <aside className="side-nav premium-card">
            <div className="side-nav-header">
              <p className="eyebrow">Navigate</p>
              <strong>Plan with clarity</strong>
            </div>
            <nav className="side-nav-links">
              {tabs.map((tab) => (
                <Link
                  key={tab.to}
                  to={tab.to}
                  className={location.pathname === tab.to ? 'side-nav-link active' : 'side-nav-link'}
                >
                  <span className="nav-icon">{tab.icon}</span>
                  {tab.label}
                </Link>
              ))}
            </nav>
            <div className="desktop-quick-card">
              <span className="muted">Capture something fast?</span>
              <button className="primary-btn premium-btn" onClick={onQuickAdd}>Quick Add</button>
            </div>
          </aside>
        ) : null}

        <main className="content">{children}</main>
      </div>

      {!isDesktop ? (
        <nav className="bottom-nav premium-nav">
          {tabs.map((tab) => (
            <Link
              key={tab.to}
              to={tab.to}
              className={location.pathname === tab.to ? 'nav-link active' : 'nav-link'}
            >
              <span className="nav-icon">{tab.icon}</span>
              <span className="nav-label">{tab.label}</span>
            </Link>
          ))}
        </nav>
      ) : null}

      {!isDesktop ? (
        <button className="mobile-fab primary-btn premium-btn" onClick={onQuickAdd}>＋</button>
      ) : null}
    </div>
  )
}

// The app frame: side navigation, top bar, tab bar, banners and toasts.
import React, { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { TODAY, formatDateLabel } from '../lib/dates.js'
import { useResponsive } from '../lib/responsive.js'
import { PRO_ROUTES } from '../lib/subscription.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { tabs, NAV_GROUPS, effectiveMode, isNavActive } from './nav.js'
import { ModeSheet, MenuSheet } from './Menus.jsx'
import { SearchSheet } from './SearchSheet.jsx'

function SideNav({ onQuickAdd, isPro = true }) {
  const { pathname } = useLocation()
  return (
    <aside className="side-nav" aria-label="Planner sections">
      <button className="side-quick-add" onClick={onQuickAdd}>
        <Plus size={18} strokeWidth={2.2} /> Quick Add
      </button>
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="side-group">
          <p className="side-group-label">{group.label}</p>
          {group.items.map((item) => {
            const active = isNavActive(item, pathname)
            return (
              <Link key={item.to} to={item.to} className={'side-link' + (active ? ' active' : '')} aria-current={active ? 'page' : undefined}>
                <span className="side-emoji" aria-hidden="true">{item.emoji}</span>
                <span>{item.label}</span>
                {!isPro && PRO_ROUTES.includes(item.to) && <span className="pro-tag side-pro">PRO</span>}
              </Link>
            )
          })}
        </div>
      ))}
      <div className="side-group side-foot">
        <Link to="/more" className={'side-link' + (pathname === '/more' ? ' active' : '')} aria-current={pathname === '/more' ? 'page' : undefined}>
          <span className="side-emoji" aria-hidden="true">⚙️</span>
          <span>More &amp; Settings</span>
        </Link>
      </div>
    </aside>
  )
}

function Layout({ children, onQuickAdd, banner, profile, onModeChange, searchData, onOpenItem, isPro = true, onUpgrade = () => {} }) {
  const location = useLocation()
  const displayName = profile?.displayName || 'Planner'
  const { isDesktop, isMobile, isTablet } = useResponsive()
  const showSideNav = !isMobile   // iPad (portrait + landscape) and desktop
  const [menuOpen, setMenuOpen] = useState(false)
  const [modeOpen, setModeOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  useEffect(() => {
    const onKey = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(true) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const onTabRoute = tabs.some((t) => t.to === location.pathname)

  // Keep the side nav pinned just below the sticky topbar, whatever its height
  // (it grows with the iOS safe-area inset).
  const topbarRef = React.useRef(null)
  React.useEffect(() => {
    const el = topbarRef.current
    if (!el) return
    const setH = () => document.documentElement.style.setProperty('--topbar-h', el.offsetHeight + 'px')
    setH()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(setH) : null
    ro?.observe(el)
    window.addEventListener('resize', setH)
    return () => { ro?.disconnect(); window.removeEventListener('resize', setH) }
  }, [])

  // ── iOS PWA safe-area fix — keeps topbar below the status bar ────────────
  React.useEffect(() => {
    // 1. Make sure viewport meta allows safe-area insets
    let meta = document.querySelector('meta[name="viewport"]')
    if (meta && !meta.content.includes('viewport-fit=cover')) {
      meta.content = meta.content + ', viewport-fit=cover'
    } else if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'viewport'
      meta.content = 'width=device-width, initial-scale=1, viewport-fit=cover'
      document.head.appendChild(meta)
    }

    // 2. Status bar style for iOS PWA (matches dark topbar)
    let statusBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    if (!statusBar) {
      statusBar = document.createElement('meta')
      statusBar.name = 'apple-mobile-web-app-status-bar-style'
      statusBar.content = 'black-translucent'
      document.head.appendChild(statusBar)
    } else {
      statusBar.content = 'black-translucent'
    }

    // 3. Inject CSS rules for safe-area padding on the topbar + body bg
    if (!document.getElementById('safe-area-styles')) {
      const style = document.createElement('style')
      style.id = 'safe-area-styles'
      style.textContent = `
        body { background: var(--ink, #0d1f33); }
        .topbar, .premium-topbar, .living-planner-topbar {
          padding-top: calc(var(--safe-top, env(safe-area-inset-top)) + 12px) !important;
          padding-left: max(env(safe-area-inset-left), 14px);
          padding-right: max(env(safe-area-inset-right), 14px);
        }
        .auth-shell {
          padding-top: max(env(safe-area-inset-top), 24px) !important;
        }
        .bottom-nav, .mobile-bottom-nav {
          padding-bottom: calc(env(safe-area-inset-bottom) + 6px);
        }
        @supports (-webkit-touch-callout: none) {
          /* iOS-only: extra safety on home indicator area */
          .app-shell { min-height: -webkit-fill-available; }
        }
      `
      document.head.appendChild(style)
    }
  }, [])

  return (
    <div className="app-shell premium-shell living-planner-shell">
      <header ref={topbarRef} className="topbar premium-topbar living-planner-topbar">
        <Link to="/" className="topbar-copy" style={{textDecoration:'none'}}>
          <p className="eyebrow">The Living Planner</p>
          <p style={{color:"rgba(255,255,255,.64)",fontSize:".72rem",marginTop:1}}>{formatDateLabel(TODAY, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </Link>

        <div className="topbar-actions">
          <button type="button" className="topbar-search" onClick={() => setSearchOpen(true)} aria-label="Search everything"><Search size={19} /></button>
          <button type="button" className="profile-pill" onClick={() => setModeOpen(true)} aria-label={`Planner mode: ${effectiveMode(profile, isPro).id}. Change mode`}>
            <span className="profile-avatar">{displayName.slice(0, 1).toUpperCase()}</span>
            <div style={{display:'flex',flexDirection:'column',gap:1,textAlign:'left'}}>
              <strong style={{lineHeight:1.1}}>{displayName}</strong>
              <span style={{fontSize:'.58rem',opacity:.92}}>{effectiveMode(profile, isPro).id} mode ▾</span>
            </div>
          </button>
        </div>
      </header>

      {banner}

      <div className={(showSideNav ? 'app-frame with-side-nav ' : 'app-frame ') + (isDesktop ? 'desktop-frame' : isMobile ? 'mobile-frame' : 'tablet-frame')}>
        {showSideNav ? <SideNav onQuickAdd={onQuickAdd} isPro={isPro} /> : null}
        <main className="content">{children}</main>
      </div>

      {!showSideNav ? (
        <nav className="bottom-nav premium-nav">
          {tabs.map((tab) => {
            const active = !menuOpen && location.pathname === tab.to
            return (
              <Link key={tab.to} to={tab.to} className={active ? 'nav-item active' : 'nav-item'} aria-current={active ? 'page' : undefined}>
                <span className="nav-icon nav-emoji" aria-hidden="true">{tab.emoji}</span>
                <span className="nav-label">{tab.label}</span>
                {!isPro && PRO_ROUTES.includes(tab.to) && <span className="pro-tag nav-pro">PRO</span>}
              </Link>
            )
          })}
          <button type="button" className={menuOpen || !onTabRoute ? 'nav-item active' : 'nav-item'}
            onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen} aria-label="Menu — all sections">
            <span className="nav-icon nav-emoji" aria-hidden="true">🗂️</span>
            <span className="nav-label">Menu</span>
          </button>
        </nav>
      ) : null}

      <SearchSheet open={searchOpen} onClose={() => setSearchOpen(false)} data={searchData || {}}
        onOpenItem={(type, item) => { setSearchOpen(false); onOpenItem && onOpenItem(type, item) }} />

      <ModeSheet open={modeOpen} current={effectiveMode(profile, isPro).id} isPro={isPro} onClose={() => setModeOpen(false)}
        onPick={(id, locked) => {
          setModeOpen(false)
          if (locked) { onUpgrade(`${id} mode is Pro`, 'Every Home mode, plus the full finance, wellness and faith tools, Life Score insights, and no limits.'); return }
          if (onModeChange && id !== effectiveMode(profile, isPro).id) onModeChange(id)
        }} />

      {!showSideNav ? <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} onQuickAdd={onQuickAdd} isPro={isPro} /> : null}

      {!showSideNav ? (
        <button onClick={onQuickAdd} style={{
          position:'fixed', bottom:'calc(env(safe-area-inset-bottom) + 84px)', right:20, zIndex:110,
          width:54, height:54, borderRadius:'50%',
          background:'linear-gradient(160deg, #C9A86B 0%, var(--brass) 50%, var(--brass2) 100%)', color:'#1C1C1E',
          border:'1px solid rgba(255,255,255,.35)',
          cursor:'pointer', display:'grid', placeItems:'center',
          boxShadow:'0 10px 26px rgba(184,150,90,.38), 0 2px 6px rgba(28,28,30,.18)',
          lineHeight:1
        }} aria-label="Quick add"><Plus size={24} strokeWidth={2.2} /></button>
      ) : null}
    </div>
  )
}


function StatusBanner({ syncing, error }) {
  const { mode } = useAuth()
  // Only show when syncing or error — hide idle mock mode noise
  if (!syncing && !error) return null
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:8,
      padding:'6px 16px', fontSize:'.75rem', fontWeight:500,
      background: error ? 'rgba(217,79,61,.08)' : 'rgba(184,150,90,.08)',
      borderBottom: `1px solid ${error ? 'rgba(217,79,61,.15)' : 'rgba(184,150,90,.12)'}`,
      color: error ? 'var(--danger)' : 'var(--brass-fg)'
    }}>
      <span style={{width:6,height:6,borderRadius:'50%',background:error?'var(--danger)':'var(--brass)',flexShrink:0}} />
      <span>{error || (syncing ? 'Syncing…' : '')}</span>
    </div>
  )
}

function ToastStack({ toasts, onDismiss }) {
  if (!toasts.length) return null

  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.type || 'info'}`}>
          <div>
            <strong>{toast.title}</strong>
            {toast.message ? <p>{toast.message}</p> : null}
          </div>
          <button className="toast-dismiss" onClick={() => onDismiss(toast.id)} aria-label="Dismiss notification">×</button>
        </div>
      ))}
    </div>
  )
}

export { Layout, StatusBanner, ToastStack }

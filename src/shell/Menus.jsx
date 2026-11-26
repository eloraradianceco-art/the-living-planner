// The mode picker and the full menu sheet.
import React, { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Plus, Check, X } from 'lucide-react'
import { FREE_MODES, PRO_ROUTES } from '../lib/subscription.js'
import { NAV_GROUPS, PLANNER_MODES, isNavActive } from './nav.js'

function ModeSheet({ open, current, onPick, onClose, isPro = true }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  return (
    <div className={'menu-sheet-root' + (open ? ' open' : '')} aria-hidden={!open}>
      <div className="menu-backdrop" onClick={onClose} />
      <div className="menu-sheet mode-sheet" role="dialog" aria-modal="true" aria-label="Planner mode">
        <div className="menu-head">
          <span>Planner mode</span>
          <button className="menu-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <p className="mode-sheet-sub">Changes what Home shows first. Nothing is hidden, and your Life Score is measured the same way.</p>
        <div className="mode-options">
          {PLANNER_MODES.map((m) => {
            const active = m.id === current
            const locked = !isPro && !FREE_MODES.includes(m.id)
            return (
              <button key={m.id} className={'mode-option' + (active ? ' active' : '') + (locked ? ' locked' : '')} onClick={() => onPick(m.id, locked)} aria-pressed={active}
                aria-label={locked ? `${m.id} mode (Pro)` : undefined}>
                <span className="mode-option-icon mode-option-emoji" aria-hidden="true">{m.emoji}</span>
                <span className="mode-option-text"><strong>{m.id}</strong><small>{m.line}</small></span>
                {active && <Check size={18} strokeWidth={2.4} className="mode-option-check" />}
                {locked && <span className="pro-tag">PRO</span>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// Phone: every section, one tap from the bottom bar. Swipe down, tap outside or ✕ to close.
function MenuSheet({ open, onClose, onQuickAdd, isPro = true }) {
  const { pathname } = useLocation()
  const sheetRef = React.useRef(null)
  const drag = React.useRef({ y: 0, dy: 0, active: false })

  useEffect(() => { if (open) onClose() }, [pathname]) // close after navigating
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open])

  const onTouchStart = (e) => {
    if (sheetRef.current && sheetRef.current.scrollTop > 0) return
    drag.current = { y: e.touches[0].clientY, dy: 0, active: true }
    sheetRef.current.style.transition = 'none'
  }
  const onTouchMove = (e) => {
    if (!drag.current.active) return
    const dy = Math.max(0, e.touches[0].clientY - drag.current.y)
    drag.current.dy = dy
    sheetRef.current.style.transform = `translateY(${dy}px)`
  }
  const onTouchEnd = () => {
    if (!drag.current.active) return
    const { dy } = drag.current
    drag.current.active = false
    sheetRef.current.style.transition = ''
    sheetRef.current.style.transform = ''
    if (dy > 90) onClose()
  }

  return (
    <div className={'menu-sheet-root' + (open ? ' open' : '')} aria-hidden={!open}>
      <div className="menu-backdrop" onClick={onClose} />
      <div ref={sheetRef} className="menu-sheet" role="dialog" aria-modal="true" aria-label="All sections"
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        <div className="menu-grabber" />
        <div className="menu-head">
          <span>Go to</span>
          <button className="menu-close" onClick={onClose} aria-label="Close menu"><X size={18} /></button>
        </div>
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="menu-group">
            <p className="side-group-label">{group.label}</p>
            <div className="menu-grid">
              {group.items.filter((item) => item.to !== '/').map((item) => {   // Home is already in the bottom bar
                const active = isNavActive(item, pathname)
                return (
                  <Link key={item.to} to={item.to} onClick={onClose} className={'menu-tile' + (active ? ' active' : '')} aria-current={active ? 'page' : undefined}>
                    <span className="menu-emoji" aria-hidden="true">{item.emoji}</span>
                    <span>{item.label}</span>
                    {!isPro && PRO_ROUTES.includes(item.to) && <span className="pro-tag menu-pro">PRO</span>}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
        <div className="menu-foot">
          <Link to="/more" onClick={onClose} className={'menu-foot-link' + (pathname === '/more' ? ' active' : '')}>
            <span aria-hidden="true">⚙️</span> More &amp; Settings
          </Link>
          <button className="menu-foot-add" onClick={() => { onClose(); onQuickAdd() }}>
            <Plus size={17} strokeWidth={2.2} /> Quick Add
          </button>
        </div>
      </div>
    </div>
  )
}

export { ModeSheet, MenuSheet }

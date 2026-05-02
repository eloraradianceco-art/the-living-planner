import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/PlannerContext.jsx'

function Layout({ children, onQuickAdd, banner, profile }) {
  const location = useLocation()
  const displayName = profile?.displayName || 'Planner'
  const { isDesktop, isMobile, isTablet } = useResponsive()

  return (
    <div className="app-shell premium-shell living-planner-shell">
      <header className="topbar premium-topbar living-planner-topbar">
        <Link to="/" className="topbar-copy" style={{textDecoration:'none'}}>
          <p className="eyebrow">The Living Planner</p>
          <p style={{color:"rgba(255,255,255,.38)",fontSize:".72rem",marginTop:1}}>{formatDateLabel(TODAY, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </Link>

        <div className="topbar-actions">
          <div className="profile-pill">
            <span className="profile-avatar">{displayName.slice(0, 1).toUpperCase()}</span>
            <div style={{display:'flex',flexDirection:'column',gap:1}}>
              <strong style={{lineHeight:1.1}}>{displayName}</strong>
              <span style={{fontSize:'.62rem',opacity:.7}}>{profile?.plannerMode || 'Balanced'} mode</span>
            </div>
          </div>
        </div>
      </header>

      {banner}

      <div className={isDesktop ? 'app-frame desktop-frame' : isMobile ? 'app-frame mobile-frame' : 'app-frame tablet-frame'}>
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
                  className={location.pathname === tab.to ? 'side-nav-link active' : 'side-nav-link'} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderRadius:'var(--radius-sm)',color:location.pathname===tab.to?'var(--brass)':'var(--text2)',fontWeight:location.pathname===tab.to?700:400,textDecoration:'none',background:location.pathname===tab.to?'var(--brass-dim)':'transparent'}}
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
              className={location.pathname === tab.to ? 'nav-item active' : 'nav-item'}
            >
              <span className="nav-icon">{tab.icon}</span>
              <span className="nav-label">{tab.label}</span>
            </Link>
          ))}
        </nav>
      ) : null}

      {!isDesktop ? (
        <button onClick={onQuickAdd} style={{
          position:'fixed', bottom:76, right:20, zIndex:90,
          width:52, height:52, borderRadius:'50%',
          background:'var(--brass)', color:'var(--warm-white)',
          border:'none', fontSize:'1.6rem', fontWeight:300,
          cursor:'pointer', display:'grid', placeItems:'center',
          boxShadow:'0 4px 20px var(--brass-glow)',
          lineHeight:1
        }}>+</button>
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
      color: error ? 'var(--danger)' : 'var(--brass)'
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


const baseForms = {
  task: { title: '', date: TODAY, time: '', category: 'Productivity', linkedGoalId: '', linkedProjectId: '', priority: 'Medium', completed: false, recurrence: 'none' },
  event: { title: '', date: TODAY, startTime: '09:00', endTime: '10:00', category: 'Business', location: '' },
  expense: { amount: '', category: 'Bills', date: TODAY, note: '' },
  note: { title: '', content: '', linkedType: '', linkedId: '' },
  goal: { title: '', category: 'Health', targetDate: addDays(TODAY, 30), why: '', timeframe: '1yr' },
  project: { title: '', goalId: '', dueDate: addDays(TODAY, 45), status: 'Active', description: '' },
  habit: { title: '', category: 'Health' },
}

const labels = { task: 'Task', event: 'Event', expense: 'Expense', note: 'Note', goal: 'Goal', project: 'Project', habit: 'Habit' }
const getInitialForm = (type, item) => ({ ...baseForms[type], ...(item || {}) })

function QuickAddModal({ isOpen, type = 'task', mode = 'create', item, onClose, goals, projects, onSave, onDelete }) {

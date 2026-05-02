import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'

export function StatusBanner({ syncing, error }) {
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

export function ToastStack({ toasts, onDismiss }) {
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

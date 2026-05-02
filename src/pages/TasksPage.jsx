import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { usePlannerData } from '../context/PlannerContext.jsx'
import { getTodayString, isOverdue, formatDateLabel } from '../utils/dates.js'
import { nextRecurringDate } from '../utils/recurring.js'

function TaskItem({ task, onToggle, onEdit, onDelete }) {
  const isTaskOverdue = task.date && task.date < TODAY && !task.completed
  const priorityColor = task.priority === 'High' ? 'var(--danger)' : task.priority === 'Medium' ? 'var(--warning)' : 'var(--muted)'

  return (
    <div style={{padding:'10px 0', borderBottom:'1px solid var(--surface)', display:'flex', alignItems:'center', gap:10}}>
      {/* Complete toggle — left side circle */}
      <button onClick={() => onToggle(task.id)} style={{
        width:24, height:24, borderRadius:'50%', border:'2px solid', flexShrink:0, cursor:'pointer',
        borderColor: task.completed ? 'var(--success)' : 'var(--teal)',
        background: task.completed ? 'var(--success)' : 'transparent',
        display:'grid', placeItems:'center'
      }}>
        {task.completed && <span style={{color:'white', fontSize:'.7rem', fontWeight:700}}>✓</span>}
      </button>

      {/* Content — middle */}
      <div style={{flex:1, minWidth:0}} onClick={() => onEdit('task', task)} >
        <div style={{
          fontWeight:600, fontSize:'.9rem', lineHeight:1.3,
          color: task.completed ? 'var(--muted)' : isTaskOverdue ? 'var(--danger)' : 'var(--text)',
          textDecoration: task.completed ? 'line-through' : 'none',
          marginBottom:2
        }}>
          {task.title}
          {task.recurrence && task.recurrence !== 'none' &&
            <span style={{marginLeft:6, fontSize:'.65rem', padding:'1px 5px', borderRadius:999, background:'var(--teal-dim)', color:'var(--teal)', fontWeight:700}}>↻</span>
          }
        </div>
        <div style={{fontSize:'.72rem', color: isTaskOverdue ? 'var(--danger)' : 'var(--muted)', display:'flex', gap:6, flexWrap:'wrap', alignItems:'center'}}>
          <span style={{width:6, height:6, borderRadius:'50%', background:priorityColor, display:'inline-block', flexShrink:0}} />
          <span>{task.category}</span>
          {task.date && <span>{isTaskOverdue ? '⚠ ' : ''}{task.date}</span>}
          {task.time && <span>{task.time}</span>}
        </div>
      </div>

      {/* Delete — right side */}
      <button onClick={() => onDelete('task', task.id)} style={{
        background:'none', border:'none', color:'var(--muted)', cursor:'pointer',
        fontSize:'1rem', padding:'4px', flexShrink:0, lineHeight:1
      }}>✕</button>
    </div>
  )
}


function TasksPage({ tasks, settings, onToggle, onEdit, onDelete, onQuickCreate }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const [status, setStatus] = useState('All')

  const filtered = useMemo(() => {
    try {
      return (tasks || []).filter((task) => {
        if (!task || !task.title) return false
        if (!(settings || {}).showCompletedTasks && task.completed) return false
        if (category !== 'All' && task.category !== category) return false
        if (status === 'Open' && task.completed) return false
        if (status === 'Done' && !task.completed) return false
        if (query && !task.title.toLowerCase().includes(query.toLowerCase())) return false
        return true
      })
    } catch(e) { return [] }
  }, [tasks, settings, category, status, query])

  const groups = {
    Overdue: filtered.filter((task) => !task.completed && isOverdue(task.date)),
    Today: filtered.filter((task) => isToday(task.date)),
    'This Week': filtered.filter((task) => isThisWeek(task.date) && !isToday(task.date) && !isOverdue(task.date)),
    Upcoming: filtered.filter((task) => !isThisWeek(task.date) && task.date > new Date().toISOString().slice(0, 10)),
    Completed: filtered.filter((task) => task.completed),
  }

  const openCount = filtered.filter(t => !t.completed).length
  const doneCount = filtered.filter(t => t.completed).length

  return (
    <div className="screen-stack">
      {/* Compact header */}
      <section className="card" style={{padding:'12px 14px'}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
          <div>
            <p className="eyebrow">Tasks</p>
            <div style={{display:'flex', gap:10, marginTop:2}}>
              <span style={{fontSize:'.78rem', color:'var(--text2)', fontWeight:600}}>{openCount} open</span>
              <span style={{fontSize:'.78rem', color:'var(--muted)'}}>{doneCount} done</span>
            </div>
          </div>
          <div style={{display:'flex', gap:6}}>
            <button className="secondary-btn" style={{fontSize:'.78rem', padding:'6px 10px'}} onClick={() => onQuickCreate('task', { recurrence: 'daily' })}>+ Recurring</button>
            <button className="primary-btn" style={{fontSize:'.78rem', padding:'6px 12px'}} onClick={() => onQuickCreate('task')}>+ Task</button>
          </div>
        </div>
        {/* Filters */}
        <div style={{display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:8}}>
          <input placeholder="Search tasks..." value={query} onChange={(e) => setQuery(e.target.value)}
            style={{padding:'8px 10px', border:'1.5px solid var(--border2)', borderRadius:'var(--radius-sm)', fontSize:'.83rem', background:'var(--surface)', color:'var(--text)'}} />
          <select value={category} onChange={(e) => setCategory(e.target.value)}
            style={{padding:'8px 6px', border:'1.5px solid var(--border2)', borderRadius:'var(--radius-sm)', fontSize:'.8rem', background:'var(--surface)', color:'var(--text2)'}}>
            <option>All</option>
            {categories.map((item) => <option key={item}>{item}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)}
            style={{padding:'8px 6px', border:'1.5px solid var(--border2)', borderRadius:'var(--radius-sm)', fontSize:'.8rem', background:'var(--surface)', color:'var(--text2)'}}>
            <option>All</option>
            <option>Open</option>
            <option>Done</option>
          </select>
        </div>
      </section>

      {Object.entries(groups).map(([label, items]) => {
        if (items.length === 0) return null
        return (
          <section key={label} className="card" style={{padding:'12px 14px'}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
              <h3 style={{fontSize:'.95rem', color: label === 'Overdue' ? 'var(--danger)' : 'var(--text)'}}>{label}</h3>
              <span className={`status-pill${label === 'Overdue' ? ' alert-pill' : ''}`} style={{fontSize:'.72rem', padding:'3px 8px'}}>{items.length}</span>
            </div>
            {items.map((task) => <TaskItem key={task.id} task={task} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />)}
          </section>
        )
      })}
    </div>
  )
}



export default TasksPage

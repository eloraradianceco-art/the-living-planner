// Tasks.
import { useMemo, useState } from 'react'
import { SquareCheck, Check } from 'lucide-react'
import { TODAY, isToday, isOverdue, isThisWeek, shortDate, fmtRange } from '../lib/dates.js'
import { PlaceLink } from '../components/Place.jsx'
import { categories } from '../lib/plannerService.js'
import { PageNav } from '../components/PageNav.jsx'
import { EmptyState } from '../components/EmptyState.jsx'
import { PageHeader } from '../components/PageHeader.jsx'

function TaskItem({ task, onToggle, onEdit, onDelete }) {
  const isTaskOverdue = task.date && task.date < TODAY && !task.completed
  const priorityColor = task.priority === 'High' ? 'var(--danger)' : task.priority === 'Medium' ? 'var(--warning)' : 'var(--muted)'

  return (
    <div style={{padding:'10px 0', borderBottom:'1px solid var(--surface)', display:'flex', alignItems:'center', gap:10}}>
      {/* Complete toggle — left side circle */}
      <button type="button" className={'step-check' + (task.completed ? ' done' : '')} onClick={() => onToggle(task.id)}
        aria-label={task.completed ? `Mark ${task.title} not done` : `Mark ${task.title} done`} aria-pressed={!!task.completed}>
        {task.completed && <Check size={13} strokeWidth={3} color="var(--warm-white)" />}
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
            <span style={{marginLeft:6, fontSize:'.62rem', padding:'1px 7px', borderRadius:999, background:'var(--brass-dim)', color:'var(--brass-fg)', fontWeight:700, textTransform:'capitalize', textDecoration:'none', display:'inline-block'}}>↻ {task.recurrence}</span>
          }
        </div>
        <div style={{fontSize:'.72rem', color: isTaskOverdue ? 'var(--danger)' : 'var(--muted)', display:'flex', gap:5, flexWrap:'wrap', alignItems:'center', marginTop:2}}>
          <span style={{display:'inline-flex',alignItems:'center',gap:3,padding:'1px 7px',borderRadius:999,background:priorityColor+'18',color:priorityColor,fontWeight:700,fontSize:'.65rem',letterSpacing:'.04em'}}>
            {task.priority || 'Low'}
          </span>
          <span style={{color:'var(--muted)',fontSize:'.7rem'}}>{task.category}</span>
          {task.date && <span style={{color: isTaskOverdue ? 'var(--danger)' : 'var(--muted)'}}>{isTaskOverdue ? '⚠ Overdue ' : ''}{shortDate(task.date)}</span>}
          {task.time && <span style={{color:'var(--brass-fg)',fontWeight:600}}>{fmtRange(task.time, task.endTime)}</span>}
          <PlaceLink place={task.location} />
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
        // Today's finished tasks always stay (checked); older ones follow the setting
        if (!(settings || {}).showCompletedTasks && task.completed && !isToday(task.date)) return false
        if (category !== 'All' && task.category !== category) return false
        if (status === 'Open' && task.completed) return false
        if (status === 'Done' && !task.completed) return false
        if (query && !task.title.toLowerCase().includes(query.toLowerCase())) return false
        return true
      })
    } catch(e) { return [] }
  }, [tasks, settings, category, status, query])

  // Soonest first, then by time, then High → Low priority
  const PRI = { High: 0, Medium: 1, Low: 2 }
  const byWhen = (a, b) => (a.date || '9999').localeCompare(b.date || '9999') || (a.time || '99:99').localeCompare(b.time || '99:99') || (PRI[a.priority] ?? 3) - (PRI[b.priority] ?? 3)
  const sorted = [...filtered].sort(byWhen)
  const groups = {
    Overdue: sorted.filter((task) => !task.completed && isOverdue(task.date)),
    Today: sorted.filter((task) => isToday(task.date)).sort((a, b) => Number(!!a.completed) - Number(!!b.completed)),
    'This Week': sorted.filter((task) => !task.completed && isThisWeek(task.date) && !isToday(task.date) && !isOverdue(task.date)),
    Upcoming: sorted.filter((task) => !task.completed && !isThisWeek(task.date) && task.date > TODAY),
    'No Date': sorted.filter((task) => !task.completed && !task.date),
    Completed: sorted.filter((task) => task.completed && !isToday(task.date)).reverse(),
  }

  const openCount = filtered.filter(t => !t.completed).length
  const doneCount = filtered.filter(t => t.completed).length

  return (
    <div className="screen-stack">
      <PageHeader icon={SquareCheck} title="Tasks" subtitle="Capture it. Schedule it. Finish it." />
      {/* Compact header */}
      <section className="card" style={{padding:'12px 14px'}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
          <div>
            <p className="eyebrow">Your list</p>
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
            <option value="All">Category</option>
            {categories.map((item) => <option key={item}>{item}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)}
            style={{padding:'8px 6px', border:'1.5px solid var(--border2)', borderRadius:'var(--radius-sm)', fontSize:'.8rem', background:'var(--surface)', color:'var(--text2)'}}>
            <option value="All">Status</option>
            <option>Open</option>
            <option>Done</option>
          </select>
        </div>
      </section>

      {Object.values(groups).every(g => g.length === 0) && (
        <section className="card">
          <EmptyState icon="✅"
            title={(tasks || []).length ? 'Nothing matches those filters' : 'A clear list — for now'}
            message={(tasks || []).length ? 'Try another category or status, or clear your search.' : 'Add the first thing on your mind. One task is how momentum starts.'} />
          {!(tasks || []).length && (
            <div style={{display:'flex', justifyContent:'center', marginTop:-16, paddingBottom:8}}>
              <button className="primary-btn" onClick={() => onQuickCreate('task')}>+ Add your first task</button>
            </div>
          )}
        </section>
      )}
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
      <PageNav />
    </div>
  )
}

export { TasksPage }

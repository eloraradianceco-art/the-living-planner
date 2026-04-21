import { useMemo, useState } from 'react'
import { categories } from '../data/seed'
import { isOverdue, isThisWeek, isToday } from '../utils/date'
import { useResponsive } from '../hooks/useResponsive'

function TaskItem({ task, onToggle, onEdit, onDelete, prefersTouch }) {
  const dragPayload = JSON.stringify({ type: 'task', id: task.id })
  return (
    <div className="list-item with-actions premium-task-item" draggable onDragStart={(event) => event.dataTransfer.setData('application/json', dragPayload)}>
      <div>
        <h4>{task.title} {task.recurrence && task.recurrence !== 'none' ? <span className="tag">Repeats {task.recurrence}</span> : null}</h4>
        <p>{task.category} • {task.date} {task.time ? `• ${task.time}` : ''} • {task.priority}</p>
      </div>
      <div className="item-actions">
        <button className={task.completed ? 'secondary-btn' : 'primary-btn premium-btn'} onClick={() => onToggle(task.id)}>
          {task.completed ? 'Done' : 'Complete'}
        </button>
        <button className="ghost-btn" onClick={() => onEdit('task', task)}>{prefersTouch && !task.time ? 'Plan' : 'Edit'}</button>
        <button className="ghost-btn" onClick={() => onDelete('task', task.id)}>Delete</button>
      </div>
    </div>
  )
}

export default function TasksPage({ tasks, settings, onToggle, onEdit, onDelete, onQuickCreate }) {
  const [query, setQuery] = useState('')
  const { prefersTouch, isMobile } = useResponsive()
  const [category, setCategory] = useState('All')
  const [status, setStatus] = useState('All')

  const filtered = useMemo(() => tasks.filter((task) => {
    if (!settings.showCompletedTasks && task.completed) return false
    if (category !== 'All' && task.category !== category) return false
    if (status === 'Open' && task.completed) return false
    if (status === 'Done' && !task.completed) return false
    if (query && !task.title.toLowerCase().includes(query.toLowerCase())) return false
    return true
  }), [tasks, settings.showCompletedTasks, category, status, query])

  const groups = {
    Today: filtered.filter((task) => isToday(task.date)),
    'This Week': filtered.filter((task) => isThisWeek(task.date) && !isToday(task.date) && !isOverdue(task.date)),
    Upcoming: filtered.filter((task) => !isThisWeek(task.date) && task.date > new Date().toISOString().slice(0, 10)),
    Overdue: filtered.filter((task) => !task.completed && isOverdue(task.date)),
  }

  const quickStats = [
    { label: 'Open', value: filtered.filter((task) => !task.completed).length },
    { label: 'Done', value: filtered.filter((task) => task.completed).length },
    { label: 'Recurring', value: filtered.filter((task) => task.recurrence && task.recurrence !== 'none').length },
    { label: 'High Priority', value: filtered.filter((task) => task.priority === 'High').length },
  ]

  return (
    <div className="screen-stack">
      <section className="card premium-card">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">Execution</p>
            <h3>Tasks</h3>
            <p className="muted">Search fast, filter what matters, and drag tasks into the calendar when you want them to become real commitments.</p>
          </div>
          <div className="button-row">
            <button className="secondary-btn" onClick={() => onQuickCreate('task', { recurrence: 'daily' })}>Add Recurring</button>
            <button className="primary-btn premium-btn" onClick={() => onQuickCreate('task')}>Add Task</button>
          </div>
        </div>
        <div className="stats-strip">
          {quickStats.map((stat) => <div key={stat.label} className="mini-stat"><span>{stat.label}</span><strong>{stat.value}</strong></div>)}
        </div>

        {prefersTouch ? <p className="muted">Touch tip: tap <strong>Plan</strong> on a task to assign its date or time when drag-and-drop isn’t convenient.</p> : null}
        <div className="filter-row">
          <input placeholder="Search tasks" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option>All</option>
            {categories.map((item) => <option key={item}>{item}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option>All</option>
            <option>Open</option>
            <option>Done</option>
          </select>
        </div>
      </section>

      {Object.entries(groups).map(([label, items]) => (
        <section key={label} className="card premium-card">
          <div className="section-title-row"><h3>{label}</h3><span className="status-pill">{items.length}</span></div>
          {items.length === 0 ? <p>Nothing here.</p> : items.map((task) => <TaskItem key={task.id} task={task} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />)}
        </section>
      ))}
    </div>
  )
}

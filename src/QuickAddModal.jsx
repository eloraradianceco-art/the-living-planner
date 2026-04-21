import { useEffect, useMemo, useState } from 'react'
import { categories } from '../data/seed'
import { TODAY, addDays } from '../utils/date'

const baseForms = {
  task: { title: '', date: TODAY, time: '', category: 'Productivity', linkedGoalId: '', linkedProjectId: '', priority: 'Medium', completed: false, recurrence: 'none' },
  event: { title: '', date: TODAY, startTime: '09:00', endTime: '10:00', category: 'Business', location: '' },
  expense: { amount: '', category: 'Bills', date: TODAY, note: '' },
  note: { title: '', content: '', linkedType: '', linkedId: '' },
  goal: { title: '', category: 'Health', targetDate: addDays(TODAY, 30), why: '' },
  project: { title: '', goalId: '', dueDate: addDays(TODAY, 45), status: 'Active', description: '' },
  habit: { title: '', category: 'Health' },
}

const labels = { task: 'Task', event: 'Event', expense: 'Expense', note: 'Note', goal: 'Goal', project: 'Project', habit: 'Habit' }
const getInitialForm = (type, item) => ({ ...baseForms[type], ...(item || {}) })

export default function QuickAddModal({ isOpen, type = 'task', mode = 'create', item, onClose, goals, projects, onSave, onDelete }) {
  const [selectedType, setSelectedType] = useState(type)
  const [form, setForm] = useState(getInitialForm(type, item))

  useEffect(() => {
    setSelectedType(type)
    setForm(getInitialForm(type, item))
  }, [type, item, isOpen])

  const title = useMemo(() => `${mode === 'edit' ? 'Edit' : 'Add'} ${labels[selectedType]}`, [mode, selectedType])
  if (!isOpen) return null

  const submit = (e) => {
    e.preventDefault()
    onSave(selectedType, { ...form, id: item?.id }, mode)
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="ghost-btn" onClick={onClose}>Close</button>
        </div>
        <div className="pill-row modal-tabs">
          {Object.keys(labels).map((option) => (
            <button key={option} className={selectedType === option ? 'pill active-pill' : 'pill'} onClick={() => mode === 'create' && (setSelectedType(option), setForm(getInitialForm(option, null)))} type="button" disabled={mode !== 'create'}>{labels[option]}</button>
          ))}
        </div>
        <form className="form-grid" onSubmit={submit}>
          {selectedType !== 'expense' && (
            <label className={selectedType === 'note' ? 'full-span' : ''}>
              Title
              <input value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} required={selectedType !== 'expense'} />
            </label>
          )}

          {selectedType === 'task' && (<>
            <label>Date<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
            <label>Time<input type="time" value={form.time || ''} onChange={(e) => setForm({ ...form, time: e.target.value })} /></label>
            <label>Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
            <label>Priority<select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option>High</option><option>Medium</option><option>Low</option></select></label>
            <label>Repeats<select value={form.recurrence || 'none'} onChange={(e) => setForm({ ...form, recurrence: e.target.value })}><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
            <label>Goal<select value={form.linkedGoalId || ''} onChange={(e) => setForm({ ...form, linkedGoalId: e.target.value })}><option value="">None</option>{goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}</select></label>
            <label className="full-span">Project<select value={form.linkedProjectId || ''} onChange={(e) => setForm({ ...form, linkedProjectId: e.target.value })}><option value="">None</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
          </>)}

          {selectedType === 'event' && (<>
            <label>Date<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
            <label>Start<input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></label>
            <label>End<input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></label>
            <label>Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
            <label className="full-span">Location<input value={form.location || ''} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Optional" /></label>
          </>)}

          {selectedType === 'expense' && (<>
            <label>Amount<input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></label>
            <label>Category<input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></label>
            <label>Date<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
            <label className="full-span">Note<input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          </>)}

          {selectedType === 'note' && (<>
            <label>Linked Type<select value={form.linkedType || ''} onChange={(e) => setForm({ ...form, linkedType: e.target.value, linkedId: '' })}><option value="">None</option><option value="goal">Goal</option><option value="project">Project</option></select></label>
            <label>Linked Item<select value={form.linkedId || ''} onChange={(e) => setForm({ ...form, linkedId: e.target.value })}><option value="">None</option>{(form.linkedType === 'goal' ? goals : form.linkedType === 'project' ? projects : []).map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}</select></label>
            <label className="full-span">Content<textarea rows="6" value={form.content || ''} onChange={(e) => setForm({ ...form, content: e.target.value })} /></label>
          </>)}

          {selectedType === 'goal' && (<>
            <label>Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
            <label>Target Date<input type="date" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} /></label>
            <label className="full-span">Why<textarea rows="4" value={form.why || ''} onChange={(e) => setForm({ ...form, why: e.target.value })} /></label>
          </>)}

          {selectedType === 'project' && (<>
            <label>Goal<select value={form.goalId || ''} onChange={(e) => setForm({ ...form, goalId: e.target.value })}><option value="">None</option>{goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}</select></label>
            <label>Due Date<input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></label>
            <label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option>Active</option><option>On Hold</option><option>Completed</option></select></label>
            <label className="full-span">Description<textarea rows="5" value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          </>)}

          {selectedType === 'habit' && <label>Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>}

          <div className="full-span modal-actions">
            {mode === 'edit' && item?.id ? <button className="danger-btn" type="button" onClick={() => { onDelete(selectedType, item.id); onClose() }}>Delete</button> : <span />}
            <button className="primary-btn" type="submit">{mode === 'edit' ? 'Save Changes' : `Save ${labels[selectedType]}`}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

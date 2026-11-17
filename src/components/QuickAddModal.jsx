// The add / edit sheet for tasks, events, goals, projects, habits, notes and expenses.
import { useEffect, useMemo, useState } from 'react'
import { MapPin } from 'lucide-react'
import { TODAY, addDays, EVENT_REPEATS, shiftEnd, endBeforeStart } from '../lib/dates.js'
import { habitTimesPerWeek } from '../lib/score.js'
import { mapsUrl, cleanPlace } from './Place.jsx'
import { categories } from '../lib/plannerService.js'
import { StepsChecklist } from './StepsChecklist.jsx'

const baseForms = {
  task: { title: '', date: TODAY, time: '', endTime: '', location: '', category: 'Productivity', linkedGoalId: '', linkedProjectId: '', priority: 'Medium', completed: false, recurrence: 'none' },
  event: { title: '', date: TODAY, startTime: '09:00', endTime: '10:00', category: 'Business', location: '', recurrence: 'none', recurrenceUntil: '' },
  expense: { amount: '', category: 'Bills', date: TODAY, note: '' },
  note: { title: '', content: '', linkedType: '', linkedId: '' },
  goal: { title: '', category: 'Health', targetDate: addDays(TODAY, 30), why: '', timeframe: '1yr', steps: [] },
  project: { title: '', goalId: '', dueDate: addDays(TODAY, 45), status: 'Active', description: '', steps: [] },
  habit: { title: '', category: 'Health' },
}

// Start + optional End for tasks and events. Moving the start keeps the length; ✕ removes the end.
function TimeRangeFields({ start, end, onChange }) {
  const bad = endBeforeStart(start, end)
  return (<>
    <label>Start<input type="time" value={start || ''} onChange={(e) => { const v = e.target.value; onChange(v, v ? shiftEnd(start, v, end) : '') }} /></label>
    <label>End (optional)
      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input type="time" value={end || ''} disabled={!start} aria-invalid={bad || undefined} style={{ flex: 1, minWidth: 0 }}
          onChange={(e) => onChange(start, e.target.value)} />
        {end && <button type="button" onClick={() => onChange(start, '')} aria-label="Remove end time"
          style={{ flexShrink: 0, width: 36, height: 36, borderRadius: '50%', border: '1.5px solid var(--border2)', background: 'var(--stone2)', color: 'var(--ink)', cursor: 'pointer', fontWeight: 700 }}>✕</button>}
      </span>
    </label>
    {bad && <p className="full-span" role="alert" style={{ color: 'var(--danger)', fontSize: '.8rem', margin: 0 }}>End time needs to be after the start time.</p>}
  </>)
}

const labels = { task: 'Task', event: 'Event', expense: 'Expense', note: 'Note', goal: 'Goal', project: 'Project', habit: 'Habit' }
const getInitialForm = (type, item) => ({ ...baseForms[type], ...(item || {}) })

// Location field for tasks and events: suggests places used before, and opens the place in Maps once filled in
function LocationField({ value, onChange, places = [] }) {
  return (
    <label className="full-span">Location
      <input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="Optional · an address or a place name"
        list={places.length ? 'planner-places' : undefined} autoComplete="off" />
      {places.length > 0 && <datalist id="planner-places">{places.map((pl) => <option key={pl} value={pl} />)}</datalist>}
      {cleanPlace(value) && (
        <a className="place-link field-place" href={mapsUrl(value)} target="_blank" rel="noopener noreferrer">
          <MapPin size={12} strokeWidth={2.2} aria-hidden="true" /><span>Open in Maps ↗</span>
        </a>
      )}
    </label>
  )
}

function QuickAddModal({ isOpen, type = 'task', mode = 'create', item, onClose, goals, projects, places = [], onSave, onDelete, isLocked = () => false, onLocked = () => {} }) {
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
    if (selectedType === 'task' && endBeforeStart(form.time, form.endTime)) return
    if (selectedType === 'event' && endBeforeStart(form.startTime, form.endTime)) return
    onSave(selectedType, { ...form, id: item?.id }, mode)
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18}}>
          <h2 className="modal-title" style={{margin:0}}>{title}</h2>
          <button onClick={onClose} style={{
            background:'var(--stone2)', border:'1.5px solid var(--border2)',
            borderRadius:'50%', width:32, height:32,
            display:'grid', placeItems:'center',
            cursor:'pointer', color:'var(--ink)', fontSize:'1rem', fontWeight:700,
            flexShrink:0
          }}>✕</button>
        </div>
        <div className="pill-row modal-tabs">
          {Object.keys(labels).map((option) => {
            const locked = mode === 'create' && option !== selectedType && isLocked(option)
            return (
              <button key={option} className={selectedType === option ? 'pill active-pill' : 'pill'} type="button" disabled={mode !== 'create'}
                aria-label={locked ? `${labels[option]} (free limit reached, Pro)` : undefined}
                onClick={() => { if (mode !== 'create') return; if (locked) { onLocked(option); return } setSelectedType(option); setForm(getInitialForm(option, null)) }}>
                {labels[option]}{locked ? ' 🔒' : ''}
              </button>
            )
          })}
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
            <TimeRangeFields start={form.time} end={form.endTime} onChange={(time, endTime) => setForm({ ...form, time, endTime })} />
            <LocationField value={form.location} places={places} onChange={(location) => setForm({ ...form, location })} />
            <label>Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
            <label>Priority<select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option>High</option><option>Medium</option><option>Low</option></select></label>
            <label>Repeats<select value={form.recurrence || 'none'} onChange={(e) => setForm({ ...form, recurrence: e.target.value })}><option value="none">Does not repeat</option><option value="daily">Every day</option><option value="weekdays">Every weekday</option><option value="weekly">Every week</option><option value="biweekly">Every 2 weeks</option><option value="monthly">Every month</option></select></label>
            {(() => {
              const projectGoal = projects.find((pr) => String(pr.id) === String(form.linkedProjectId || ''))?.goalId || ''
              return (<>
                <label>Goal<select value={projectGoal || form.linkedGoalId || ''} disabled={!!projectGoal} onChange={(e) => setForm({ ...form, linkedGoalId: e.target.value })}><option value="">None</option>{goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}</select>
                  {projectGoal && <span className="muted" style={{ fontSize: '.72rem', fontWeight: 400 }}>Set by its project</span>}</label>
                <label className="full-span">Project<select value={form.linkedProjectId || ''} onChange={(e) => { const v = e.target.value; const g = projects.find((pr) => String(pr.id) === String(v))?.goalId; setForm({ ...form, linkedProjectId: v, ...(g ? { linkedGoalId: g } : {}) }) }}><option value="">None</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
              </>)
            })()}
          </>)}

          {selectedType === 'event' && (<>
            <label>Date<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
            <TimeRangeFields start={form.startTime} end={form.endTime} onChange={(startTime, endTime) => setForm({ ...form, startTime, endTime })} />
            <label>Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
            <LocationField value={form.location} places={places} onChange={(location) => setForm({ ...form, location })} />
            <label>Repeats<select value={form.recurrence || 'none'} onChange={(e) => setForm({ ...form, recurrence: e.target.value })}>{EVENT_REPEATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            {(form.recurrence || 'none') !== 'none' && (
              <label>Until (optional)<input type="date" value={form.recurrenceUntil || ''} min={form.date} onChange={(e) => setForm({ ...form, recurrenceUntil: e.target.value })} /></label>
            )}
            {mode === 'edit' && (form.recurrence || 'none') !== 'none' && (
              <p className="full-span muted" style={{ fontSize: '.76rem', margin: 0 }}>Changes apply to every occurrence. To remove a single date, use ✕ on that day in the calendar.</p>
            )}
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
            <label className="full-span">Timeframe<select value={form.timeframe||'1yr'} onChange={(e) => setForm({...form,timeframe:e.target.value})} style={{padding:'9px 10px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.9rem',background:'var(--stone)',color:'var(--text)'}}><option value='1wk'>1 Week</option><option value='1mo'>1 Month</option><option value='6mo'>6 Months</option><option value='1yr'>1 Year</option><option value='3yr'>3 Years</option><option value='5yr'>5 Years</option></select></label>
            <label>Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
            <label>Target Date<input type="date" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} /></label>
            <label className="full-span">Why<textarea rows="4" value={form.why || ''} onChange={(e) => setForm({ ...form, why: e.target.value })} /></label>
            <div className="full-span"><StepsChecklist steps={form.steps} onChange={(steps) => setForm((f) => ({ ...f, steps }))} hint="Type a step and press Return. Paste a list to add several." /></div>
          </>)}

          {selectedType === 'project' && (<>
            <label>Goal<select value={form.goalId || ''} onChange={(e) => setForm({ ...form, goalId: e.target.value })}><option value="">None</option>{goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}</select></label>
            <label>Due Date<input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></label>
            <label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option>Active</option><option>In Progress</option><option>On Hold</option><option>Completed</option></select></label>
            <label className="full-span">Description<textarea rows="4" value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
            <div className="full-span"><StepsChecklist steps={form.steps} onChange={(steps) => setForm((f) => ({ ...f, steps }))} hint="Type a step and press Return. Paste a list to add several." /></div>
          </>)}

          {selectedType === 'habit' && (<>
            <label>Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
            <label>How often<select value={(() => { const n = habitTimesPerWeek(form); return n < 7 ? `${n}x` : 'daily' })()} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
              <option value="daily">Every day</option>
              {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={`${n}x`}>{n}× a week</option>)}
            </select></label>
          </>)}

          <div className="full-span modal-actions">
            {mode === 'edit' && item?.id ? <button className="danger-btn" type="button" onClick={async () => { if (await onDelete(selectedType, item.id) !== false) onClose() }}>Delete</button> : <span />}
            <button className="primary-btn" type="submit">{mode === 'edit' ? 'Save Changes' : `Save ${labels[selectedType]}`}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export { labels, QuickAddModal }

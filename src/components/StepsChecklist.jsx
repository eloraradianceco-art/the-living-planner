// The steps checklist used by goals and projects.
import { useState } from 'react'
import { Plus, ChevronUp, ChevronDown, CalendarPlus, Trash2, Check, Flag } from 'lucide-react'
import { newStepId, normalizeSteps, parseStepLines } from '../lib/steps.js'

// ── Empty State Component ─────────────────────────────────────────────────
// Shown when a goal or project reaches 100%: finish it, or "Not yet" (remembered on this device).
const READY_KEY = 'planner_ready_dismissed'
const readyDismissed = () => { try { return new Set(JSON.parse(localStorage.getItem(READY_KEY) || '[]')) } catch { return new Set() } }
function ReadyToComplete({ id, kind, onComplete, onDismiss }) {
  const key = `${kind}:${id}`
  const [hidden, setHidden] = useState(() => readyDismissed().has(key))
  if (hidden) return null
  const notYet = () => {
    try { const set = readyDismissed(); set.add(key); localStorage.setItem(READY_KEY, JSON.stringify([...set])) } catch {}
    setHidden(true); onDismiss && onDismiss()
  }
  return (
    <div className="steps-complete ready-complete" role="status">
      <Flag size={15} color="var(--success)" />
      <span>Everything for this {kind} is done.</span>
      <button type="button" className="steps-complete-btn" onClick={onComplete}>{kind === 'goal' ? 'Mark goal achieved' : 'Mark project complete'}</button>
      <button type="button" className="ready-not-yet" onClick={notYet}>Not yet</button>
    </div>
  )
}
const isReadyDismissed = (kind, id) => readyDismissed().has(`${kind}:${id}`)

function StepsChecklist({ steps, onChange, onSchedule, completeSlot, label = 'Steps', hint, hideDoneNote = false }) {
  const list = normalizeSteps(steps)
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const [showDone, setShowDone] = useState(false)
  const doneCount = list.filter((st) => st.done).length
  const nextId = list.length > 1 ? list.find((st) => !st.done)?.id : null
  const collapseDone = doneCount > 3 && !showDone
  const visible = collapseDone ? list.filter((st) => !st.done) : list

  const addLines = (lines) => { if (lines.length) onChange([...list, ...lines.map((text) => ({ id: newStepId(), text, done: false, doneAt: null }))]) }
  const addDraft = () => { addLines(parseStepLines(draft)); setDraft('') }
  const toggle = (id) => onChange(list.map((st) => st.id === id ? { ...st, done: !st.done, doneAt: st.done ? null : new Date().toISOString() } : st))
  const remove = (id) => { onChange(list.filter((st) => st.id !== id)); setEditingId(null) }
  const move = (id, dir) => {
    const i = list.findIndex((st) => st.id === id), j = i + dir
    if (i < 0 || j < 0 || j >= list.length) return
    const next = [...list]; [next[i], next[j]] = [next[j], next[i]]; onChange(next)
  }
  const startEdit = (st) => { setEditingId(st.id); setEditText(st.text) }
  const saveEdit = () => {
    const text = editText.trim()
    const cur = list.find((st) => st.id === editingId)
    if (text && cur && text !== cur.text) onChange(list.map((st) => st.id === editingId ? { ...st, text } : st))
    setEditingId(null)
  }

  return (
    <div className="steps">
      <div className="steps-head">
        <span className="steps-label">{label}</span>
        {list.length > 0 && <span className="steps-count">{doneCount}/{list.length} done</span>}
      </div>

      {visible.map((st) => {
        const idx = list.findIndex((x) => x.id === st.id)
        const editing = editingId === st.id
        return (
          <div key={st.id} className={'step-row' + (st.done ? ' done' : '')}>
            <button type="button" className={'step-check' + (st.done ? ' done' : st.id === nextId ? ' next' : '')}
              onClick={() => toggle(st.id)} aria-label={st.done ? `Uncheck ${st.text}` : `Check off ${st.text}`} aria-pressed={st.done}>
              {st.done && <Check size={13} strokeWidth={3} color="var(--warm-white)" />}
            </button>
            {editing ? (
              <div className="step-edit">
                <input autoFocus value={editText} onChange={(e) => setEditText(e.target.value)} aria-label="Edit step"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); saveEdit() }
                    if (e.key === 'Escape') { e.preventDefault(); setEditingId(null) }
                  }} />
                <div className="step-tools">
                  <button type="button" className="step-tool" onClick={() => move(st.id, -1)} disabled={idx === 0} aria-label="Move up"><ChevronUp size={16} /></button>
                  <button type="button" className="step-tool" onClick={() => move(st.id, 1)} disabled={idx === list.length - 1} aria-label="Move down"><ChevronDown size={16} /></button>
                  {onSchedule && (
                    <button type="button" className="step-tool wide" onClick={() => { setEditingId(null); onSchedule({ ...st, text: editText.trim() || st.text }) }}>
                      <CalendarPlus size={15} /> Schedule
                    </button>
                  )}
                  <button type="button" className="step-tool danger" onClick={() => remove(st.id)} aria-label="Delete step"><Trash2 size={15} /></button>
                  <button type="button" className="step-tool primary" onClick={saveEdit}>Done</button>
                </div>
              </div>
            ) : (
              <button type="button" className="step-text" onClick={() => startEdit(st)} title="Tap to edit">
                {st.text}
                {st.id === nextId && <span className="step-next-tag">Next</span>}
              </button>
            )}
          </div>
        )
      })}

      {doneCount > 3 && (
        <button type="button" className="steps-more" onClick={() => setShowDone((v) => !v)}>
          {showDone ? 'Hide completed' : `Show ${doneCount} completed`}
        </button>
      )}

      {list.length > 0 && doneCount === list.length && !hideDoneNote && (
        <div className="steps-complete">
          <Flag size={15} color="var(--success)" />
          <span>Every step is checked off.</span>
          {completeSlot}
        </div>
      )}

      <div className="step-add">
        <Plus size={16} color="var(--brass2)" />
        <input value={draft} placeholder={list.length ? 'Add another step' : 'Add the first step'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDraft() } }}
          onPaste={(e) => {
            const text = e.clipboardData?.getData('text') || ''
            if (/\r?\n/.test(text.trim())) { e.preventDefault(); addLines(parseStepLines(draft + text)); setDraft('') }
          }}
          aria-label="New step" enterKeyHint="done" />
        {draft.trim() && <button type="button" onClick={addDraft}>Add</button>}
      </div>
      {hint && <div className="steps-hint">{hint}</div>}
    </div>
  )
}

export { ReadyToComplete, isReadyDismissed, StepsChecklist }

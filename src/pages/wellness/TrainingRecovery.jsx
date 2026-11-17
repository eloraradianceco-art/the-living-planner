// Wellness: Training and Recovery tabs.
import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { TODAY, addDays, startOfWeek, formatDateLabel, shortDate } from '../../lib/dates.js'
import { newStepId } from '../../lib/steps.js'
import { EmptyState } from '../../components/EmptyState.jsx'
import { readinessOf, readinessBand, PAIN_AREAS, TRAINING_TYPES, exKey, fmtSet } from './helpers.js'
import { sleepHoursFrom, fmtHours, SLEEP_MAX_HOURS } from '../../lib/sleep.js'

function ScaleRow({ label, low, high, value, onChange }) {
  return (
    <div className="scale-block">
      <div className="scale-head"><span>{label}</span><small>{low} → {high}</small></div>
      <div className="scale-row" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n}
            className={'scale-btn' + (value === n ? ' active' : '')} onClick={() => onChange(n)}>{n}</button>
        ))}
      </div>
    </div>
  )
}

function TrainingTab({ workouts, onSave }) {
  const blankEx = () => ({ id: newStepId(), name: '', sets: '', reps: '', weight: '' })
  const blank = () => ({ type: 'Strength', duration: '', effort: '', date: TODAY, notes: '', exercises: [blankEx()] })
  const [f, setF] = useState(blank)
  const [open, setOpen] = useState(false)

  const weekStart = startOfWeek(TODAY)
  const thisWeek = workouts.filter((w) => w.date >= weekStart && w.date <= TODAY)
  const weekMins = thisWeek.reduce((n, w) => n + Number(w.duration || 0), 0)

  // Per-exercise history (most recent first) → "Last" + "Best"
  const history = useMemo(() => {
    const map = {}
    workouts.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).forEach((w) => (w.exercises || []).forEach((e) => {
      const k = exKey(e.name); if (!k) return
      if (!map[k]) map[k] = { name: e.name.trim(), last: e, lastDate: w.date, best: Number(e.weight) || 0, count: 0 }
      map[k].best = Math.max(map[k].best, Number(e.weight) || 0); map[k].count += 1
    }))
    return map
  }, [workouts])
  const topLifts = Object.values(history).sort((a, b) => b.count - a.count).slice(0, 6)

  const setEx = (id, patch) => setF((p) => ({ ...p, exercises: p.exercises.map((e) => e.id === id ? { ...e, ...patch } : e) }))
  const save = () => {
    const exercises = f.exercises.filter((e) => e.name.trim()).map((e) => ({ ...e, name: e.name.trim() }))
    if (!f.duration && !exercises.length) return
    onSave([{ ...f, exercises, id: Date.now() }, ...workouts])
    setF(blank()); setOpen(false)
  }

  return (
    <div className="screen-stack" style={{ gap: 14 }}>
      <section className="card">
        <p className="eyebrow">Training</p>
        <h3 style={{ margin: '4px 0 12px' }}>Log the work</h3>
        <div className="wl-stats">
          <div><strong>{thisWeek.length}</strong><span>sessions this week</span></div>
          <div><strong>{weekMins}</strong><span>minutes this week</span></div>
          <div><strong>{workouts.length}</strong><span>total logged</span></div>
        </div>

        {!open ? (
          <button className="primary-btn" style={{ width: '100%', marginTop: 12 }} onClick={() => setOpen(true)}>+ Log a session</button>
        ) : (
          <div className="wl-form">
            <div className="wl-grid3">
              <label>Type<select value={f.type} onChange={(e) => setF((p) => ({ ...p, type: e.target.value }))}>{TRAINING_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
              <label>Minutes<input type="number" inputMode="numeric" value={f.duration} onChange={(e) => setF((p) => ({ ...p, duration: e.target.value }))} placeholder="45" /></label>
              <label>Effort<select value={f.effort} onChange={(e) => setF((p) => ({ ...p, effort: e.target.value }))}><option value="">—</option>{[5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>RPE {n}</option>)}</select></label>
            </div>
            <label>Date<input type="date" value={f.date} onChange={(e) => setF((p) => ({ ...p, date: e.target.value }))} /></label>

            <div className="wl-ex-head"><span>Exercises</span><small>sets × reps @ lb</small></div>
            <datalist id="exercise-names">{Object.values(history).map((h) => <option key={h.name} value={h.name} />)}</datalist>
            {f.exercises.map((e) => {
              const h = history[exKey(e.name)]
              return (
                <div key={e.id} className="wl-ex">
                  <div className="wl-ex-row">
                    <input className="wl-ex-name" list="exercise-names" placeholder="Exercise (e.g. Trap bar deadlift)" value={e.name} onChange={(ev) => setEx(e.id, { name: ev.target.value })} />
                    {f.exercises.length > 1 && <button type="button" className="time-card-del" onClick={() => setF((p) => ({ ...p, exercises: p.exercises.filter((x) => x.id !== e.id) }))} aria-label="Remove exercise">✕</button>}
                  </div>
                  <div className="wl-ex-nums">
                    <input type="number" inputMode="numeric" placeholder="Sets" value={e.sets} onChange={(ev) => setEx(e.id, { sets: ev.target.value })} />
                    <input type="number" inputMode="numeric" placeholder="Reps" value={e.reps} onChange={(ev) => setEx(e.id, { reps: ev.target.value })} />
                    <input type="number" inputMode="decimal" placeholder="lb" value={e.weight} onChange={(ev) => setEx(e.id, { weight: ev.target.value })} />
                  </div>
                  {h && <div className="wl-ex-hint">Last {shortDate(h.lastDate)}: {fmtSet(h.last) || '—'}{h.best ? ` · Best ${h.best} lb` : ''}</div>}
                </div>
              )
            })}
            <button type="button" className="wl-add-ex" onClick={() => setF((p) => ({ ...p, exercises: [...p.exercises, blankEx()] }))}><Plus size={15} /> Add exercise</button>
            <input placeholder="Notes (PRs, how it felt, what to change)" value={f.notes} onChange={(e) => setF((p) => ({ ...p, notes: e.target.value }))} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="secondary-btn" style={{ flex: 1 }} onClick={() => { setF(blank()); setOpen(false) }}>Cancel</button>
              <button className="primary-btn" style={{ flex: 2 }} onClick={save}>Save session</button>
            </div>
          </div>
        )}
      </section>

      {topLifts.length > 0 && (
        <section className="card">
          <p className="eyebrow">Progress</p>
          <h3 style={{ margin: '4px 0 10px' }}>Your main lifts</h3>
          {topLifts.map((h) => (
            <div key={h.name} className="metric-row card-row">
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '.9rem' }}>{h.name}</div>
                <div className="muted" style={{ fontSize: '.74rem' }}>Last {shortDate(h.lastDate)} · {fmtSet(h.last) || '—'} · {h.count} session{h.count !== 1 ? 's' : ''}</div>
              </div>
              {h.best > 0 && <strong style={{ color:'var(--brass-fg)', fontSize: '.9rem', whiteSpace: 'nowrap' }}>{h.best} lb</strong>}
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <p className="eyebrow">History</p>
        {workouts.length === 0 ? (
          <EmptyState icon="💪" title="No sessions yet" message="Log your first session. Exercises you enter here show your last numbers next time." />
        ) : workouts.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 20).map((w) => (
          <div key={w.id} className="wl-session">
            <div className="wl-session-head">
              <div>
                <strong>{w.type}</strong>
                <span className="muted"> · {shortDate(w.date)}{w.duration ? ` · ${w.duration} min` : ''}{w.effort ? ` · RPE ${w.effort}` : ''}</span>
              </div>
              <button className="time-card-del" onClick={() => { if (window.confirm('Delete this session?')) onSave(workouts.filter((x) => x.id !== w.id)) }} aria-label="Delete session">✕</button>
            </div>
            {(w.exercises || []).length > 0 && (
              <ul className="wl-session-ex">{w.exercises.map((e, i) => <li key={i}><span>{e.name}</span><span>{fmtSet(e)}</span></li>)}</ul>
            )}
            {w.notes && <div className="muted" style={{ fontSize: '.78rem', marginTop: 4 }}>{w.notes}</div>}
          </div>
        ))}
      </section>
    </div>
  )
}

function RecoveryTab({ checkins, onSave, sleep }) {
  const today = checkins[TODAY]
  const lastSleep = (sleep || []).find((e) => e.date === TODAY)
  const prefillSleep = lastSleep ? (sleepHoursFrom(lastSleep.bed, lastSleep.wake) || '') : ''
  const blank = () => ({ sleepHours: prefillSleep, energy: 0, soreness: 0, stress: 0, pain: [], note: '' })
  const [editing, setEditing] = useState(!today)
  const [f, setF] = useState(() => today ? { ...blank(), ...today } : blank())
  const live = readinessOf({ ...f, energy: f.energy || 3, soreness: f.soreness || 3, stress: f.stress || 3 })
  const score = today ? readinessOf(today) : null
  const band = readinessBand(score)
  const hoursOk = f.sleepHours === '' || f.sleepHours == null || (Number(f.sleepHours) >= 0 && Number(f.sleepHours) <= SLEEP_MAX_HOURS)
  const ready = f.energy && f.soreness && f.stress && hoursOk

  const last7 = Array.from({ length: 7 }, (_, i) => addDays(TODAY, i - 6)).map((d) => ({ d, v: readinessOf(checkins[d]) }))
  const painCounts = {}
  Array.from({ length: 14 }, (_, i) => addDays(TODAY, -i)).forEach((d) => (checkins[d]?.pain || []).forEach((a) => { painCounts[a] = (painCounts[a] || 0) + 1 }))
  const painList = Object.entries(painCounts).sort((a, b) => b[1] - a[1])

  return (
    <div className="screen-stack" style={{ gap: 14 }}>
      <section className="card">
        <p className="eyebrow">Recovery</p>
        <h3 style={{ margin: '4px 0 12px' }}>{editing ? 'Daily check-in' : 'Today\'s readiness'}</h3>

        {!editing && today ? (
          <>
            <div className={'readiness-hero tone-' + band.tone}>
              <div className="readiness-num">{score}</div>
              <div>
                <strong>{band.label}</strong>
                <p>{band.advice}</p>
              </div>
            </div>
            <div className="readiness-inputs">
              {Number(today.sleepHours) > 0 && Number(today.sleepHours) <= SLEEP_MAX_HOURS ? <span>Sleep {fmtHours(today.sleepHours)}</span> : null}
              <span>Energy {today.energy}/5</span><span>Soreness {today.soreness}/5</span><span>Stress {today.stress}/5</span>
              {(today.pain || []).length > 0 && <span>Pain: {today.pain.join(', ')}</span>}
            </div>
            <button className="secondary-btn" style={{ marginTop: 12 }} onClick={() => { setF({ ...blank(), ...today }); setEditing(true) }}>Edit check-in</button>
          </>
        ) : (
          <div className="wl-form" style={{ marginTop: 0 }}>
            <label>Sleep last night (hours){lastSleep ? <small className="muted" style={{ fontWeight: 400 }}> · from your sleep log</small> : null}
              <input type="number" step="0.5" min="0" max={SLEEP_MAX_HOURS} inputMode="decimal" value={f.sleepHours} placeholder="7.5" onChange={(e) => setF((p) => ({ ...p, sleepHours: e.target.value }))} />
              {!hoursOk && <small className="field-error">Enter 0–{SLEEP_MAX_HOURS} hours</small>}
            </label>
            <ScaleRow label="Energy" low="drained" high="charged" value={f.energy} onChange={(n) => setF((p) => ({ ...p, energy: n }))} />
            <ScaleRow label="Soreness" low="fresh" high="beat up" value={f.soreness} onChange={(n) => setF((p) => ({ ...p, soreness: n }))} />
            <ScaleRow label="Stress" low="calm" high="maxed" value={f.stress} onChange={(n) => setF((p) => ({ ...p, stress: n }))} />
            <div className="scale-block">
              <div className="scale-head"><span>Anything hurting?</span><small>tap all that apply</small></div>
              <div className="pain-chips">
                {PAIN_AREAS.map((a) => {
                  const on = f.pain.includes(a)
                  return <button key={a} type="button" className={'pain-chip' + (on ? ' on' : '')} aria-pressed={on}
                    onClick={() => setF((p) => ({ ...p, pain: on ? p.pain.filter((x) => x !== a) : [...p.pain, a] }))}>{a}</button>
                })}
              </div>
            </div>
            <input placeholder="Note (optional)" value={f.note} onChange={(e) => setF((p) => ({ ...p, note: e.target.value }))} />
            <button className="primary-btn" disabled={!ready} style={{ opacity: ready ? 1 : .5 }}
              onClick={() => { onSave({ ...checkins, [TODAY]: { ...f, sleepHours: f.sleepHours === '' ? '' : Number(f.sleepHours), at: new Date().toISOString() } }); setEditing(false) }}>
              {ready ? `Save · readiness ${live}` : !hoursOk ? 'Check sleep hours' : 'Rate energy, soreness and stress'}
            </button>
            {today && <button className="secondary-btn" onClick={() => setEditing(false)}>Cancel</button>}
          </div>
        )}
      </section>

      <section className="card">
        <p className="eyebrow">Last 7 days</p>
        <div className="readiness-bars">
          {last7.map(({ d, v }) => (
            <div key={d} className="readiness-bar">
              <div className="readiness-bar-track"><div className={'readiness-bar-fill tone-' + (readinessBand(v)?.tone || 'none')} style={{ height: `${v ?? 0}%` }} /></div>
              <span className="readiness-bar-val">{v ?? '–'}</span>
              <span className="readiness-bar-day">{formatDateLabel(d, { weekday: 'narrow' })}</span>
            </div>
          ))}
        </div>
        {painList.length > 0 && (
          <>
            <p className="eyebrow" style={{ marginTop: 14 }}>Pain, last 14 days</p>
            <div className="pain-chips">{painList.map(([a, n]) => <span key={a} className="pain-chip on static">{a} · {n} day{n !== 1 ? 's' : ''}</span>)}</div>
          </>
        )}
      </section>
    </div>
  )
}

export { TrainingTab, RecoveryTab }

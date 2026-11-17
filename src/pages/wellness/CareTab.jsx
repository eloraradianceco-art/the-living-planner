// Wellness: Care tab (appointments, vitals).
import { useMemo, useState } from 'react'
import { TODAY, shortDate, fmt12 } from '../../lib/dates.js'
import { exKey } from './helpers.js'

// Blood pressure category (American Heart Association ranges) — a label, not a diagnosis.
function bpCategory(sys, dia) {
  sys = Number(sys); dia = Number(dia)
  if (!sys || !dia) return null
  if (sys > 180 || dia > 120) return { label: 'Very high — contact your doctor', tone: 'low' }
  if (sys >= 140 || dia >= 90) return { label: 'High (stage 2)', tone: 'low' }
  if (sys >= 130 || dia >= 80) return { label: 'High (stage 1)', tone: 'mid' }
  if (sys >= 120) return { label: 'Elevated', tone: 'mid' }
  return { label: 'Normal', tone: 'good' }
}

function CareTab({ vitals, onSaveVitals, appts, onSaveAppts, labs, onSaveLabs, onAddEvent }) {
  const [v, setV] = useState({ date: TODAY, sys: '', dia: '', rhr: '', hrv: '' })
  const [a, setA] = useState({ date: TODAY, time: '09:00', who: '', reason: '', addToCalendar: true })
  const [l, setL] = useState({ date: TODAY, test: '', value: '', unit: '' })
  const latest = vitals[0]
  const cat = latest ? bpCategory(latest.sys, latest.dia) : null
  const upcoming = appts.filter((x) => x.date >= TODAY).sort((x, y) => `${x.date}${x.time}`.localeCompare(`${y.date}${y.time}`))
  const past = appts.filter((x) => x.date < TODAY).sort((x, y) => y.date.localeCompare(x.date)).slice(0, 5)
  const labGroups = useMemo(() => {
    const g = {}
    labs.slice().sort((x, y) => y.date.localeCompare(x.date)).forEach((r) => { const k = exKey(r.test); (g[k] = g[k] || { name: r.test, rows: [] }).rows.push(r) })
    return Object.values(g)
  }, [labs])

  return (
    <div className="screen-stack" style={{ gap: 14 }}>
      <section className="card">
        <p className="eyebrow">Vitals</p>
        <h3 style={{ margin: '4px 0 12px' }}>Blood pressure &amp; heart</h3>
        {latest && (
          <div className={'readiness-hero compact tone-' + (cat?.tone || 'mid')} style={{ marginBottom: 12 }}>
            <div className="readiness-num" style={{ fontSize: '1rem', lineHeight: 1.1, textAlign: 'center' }}>{latest.sys && latest.dia ? <>{latest.sys}<br />{latest.dia}</> : '—'}</div>
            <div>
              <strong>{cat ? cat.label : 'Latest reading'}</strong>
              <p>{shortDate(latest.date)}{latest.rhr ? ` · Resting HR ${latest.rhr}` : ''}{latest.hrv ? ` · HRV ${latest.hrv}` : ''}</p>
            </div>
          </div>
        )}
        <div className="wl-form" style={{ marginTop: 0 }}>
          <div className="wl-grid3" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <input type="number" inputMode="numeric" placeholder="Systolic (top)" value={v.sys} onChange={(e) => setV((p) => ({ ...p, sys: e.target.value }))} />
            <input type="number" inputMode="numeric" placeholder="Diastolic (bottom)" value={v.dia} onChange={(e) => setV((p) => ({ ...p, dia: e.target.value }))} />
            <input type="number" inputMode="numeric" placeholder="Resting HR (bpm)" value={v.rhr} onChange={(e) => setV((p) => ({ ...p, rhr: e.target.value }))} />
            <input type="number" inputMode="numeric" placeholder="HRV (ms, optional)" value={v.hrv} onChange={(e) => setV((p) => ({ ...p, hrv: e.target.value }))} />
          </div>
          <input type="date" value={v.date} onChange={(e) => setV((p) => ({ ...p, date: e.target.value }))} />
          <button className="primary-btn" onClick={() => {
            if (!v.sys && !v.rhr && !v.hrv) return
            onSaveVitals([{ ...v, id: Date.now() }, ...vitals].sort((x, y) => y.date.localeCompare(x.date)))
            setV({ date: TODAY, sys: '', dia: '', rhr: '', hrv: '' })
          }}>+ Log vitals</button>
        </div>
        {vitals.slice(0, 8).map((r) => {
          const c = bpCategory(r.sys, r.dia)
          return (
            <div key={r.id} className="metric-row card-row">
              <div>
                <div style={{ fontWeight: 600, fontSize: '.88rem' }}>{r.sys && r.dia ? `${r.sys}/${r.dia}` : '—'}{r.rhr ? ` · ${r.rhr} bpm` : ''}{r.hrv ? ` · HRV ${r.hrv}` : ''}</div>
                <div className="muted" style={{ fontSize: '.74rem' }}>{shortDate(r.date)}{c ? ` · ${c.label}` : ''}</div>
              </div>
              <button className="time-card-del" aria-label="Delete reading" onClick={() => onSaveVitals(vitals.filter((x) => x.id !== r.id))}>✕</button>
            </div>
          )
        })}
      </section>

      <section className="card">
        <p className="eyebrow">Appointments</p>
        <h3 style={{ margin: '4px 0 12px' }}>Doctor, dentist, therapy, PT</h3>
        <div className="wl-form" style={{ marginTop: 0 }}>
          <input placeholder="Who (e.g. Dr. Smith, dentist)" value={a.who} onChange={(e) => setA((p) => ({ ...p, who: e.target.value }))} />
          <input placeholder="Reason or what to ask" value={a.reason} onChange={(e) => setA((p) => ({ ...p, reason: e.target.value }))} />
          <div className="wl-grid3" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <input type="date" value={a.date} onChange={(e) => setA((p) => ({ ...p, date: e.target.value }))} />
            <input type="time" value={a.time} onChange={(e) => setA((p) => ({ ...p, time: e.target.value }))} />
          </div>
          {onAddEvent && (
            <label className="care-check"><input type="checkbox" checked={a.addToCalendar} onChange={(e) => setA((p) => ({ ...p, addToCalendar: e.target.checked }))} /> Also put it on my calendar</label>
          )}
          <button className="primary-btn" onClick={() => {
            if (!a.who.trim()) return
            const appt = { id: Date.now(), date: a.date, time: a.time, who: a.who.trim(), reason: a.reason.trim() }
            onSaveAppts([...appts, appt])
            if (a.addToCalendar && onAddEvent) onAddEvent({ title: appt.reason ? `${appt.who} · ${appt.reason}` : appt.who, date: appt.date, startTime: appt.time, endTime: '', category: 'Health', location: '' })
            setA({ date: TODAY, time: '09:00', who: '', reason: '', addToCalendar: true })
          }}>+ Add appointment</button>
        </div>
        {upcoming.length === 0 && past.length === 0 && <p className="muted" style={{ fontSize: '.84rem', margin: '10px 0 0' }}>No appointments yet.</p>}
        {[...upcoming, ...past].map((x) => (
          <div key={x.id} className="metric-row card-row" style={x.date < TODAY ? { opacity: .6 } : undefined}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '.88rem' }}>{x.who}</div>
              <div className="muted" style={{ fontSize: '.74rem' }}>{shortDate(x.date)}{x.time ? ` · ${fmt12(x.time)}` : ''}{x.reason ? ` · ${x.reason}` : ''}</div>
            </div>
            <button className="time-card-del" aria-label="Delete appointment" onClick={() => onSaveAppts(appts.filter((y) => y.id !== x.id))}>✕</button>
          </div>
        ))}
      </section>

      <section className="card">
        <p className="eyebrow">Lab results</p>
        <h3 style={{ margin: '4px 0 12px' }}>Track numbers over time</h3>
        <div className="wl-form" style={{ marginTop: 0 }}>
          <datalist id="lab-names">{labGroups.map((g) => <option key={g.name} value={g.name} />)}</datalist>
          <input list="lab-names" placeholder="Test (e.g. Vitamin D, A1C, LDL)" value={l.test} onChange={(e) => setL((p) => ({ ...p, test: e.target.value }))} />
          <div className="wl-grid3">
            <input placeholder="Value" inputMode="decimal" value={l.value} onChange={(e) => setL((p) => ({ ...p, value: e.target.value }))} />
            <input placeholder="Unit" value={l.unit} onChange={(e) => setL((p) => ({ ...p, unit: e.target.value }))} />
            <input type="date" value={l.date} onChange={(e) => setL((p) => ({ ...p, date: e.target.value }))} />
          </div>
          <button className="primary-btn" onClick={() => {
            if (!l.test.trim() || !l.value) return
            onSaveLabs([...labs, { ...l, test: l.test.trim(), id: Date.now() }])
            setL((p) => ({ ...p, value: '' }))
          }}>+ Add result</button>
        </div>
        {labGroups.map((g) => (
          <div key={g.name} className="metric-row card-row">
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '.88rem' }}>{g.name}</div>
              <div className="muted" style={{ fontSize: '.74rem' }}>{g.rows.slice(0, 4).map((r) => `${r.value}${r.unit ? ' ' + r.unit : ''} (${shortDate(r.date)})`).join(' → ')}</div>
            </div>
            <button className="time-card-del" aria-label="Delete latest result" onClick={() => onSaveLabs(labs.filter((x) => x.id !== g.rows[0].id))}>✕</button>
          </div>
        ))}
      </section>
    </div>
  )
}

export { CareTab }

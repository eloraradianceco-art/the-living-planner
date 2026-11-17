// Finance: savings goals and sinking funds (add money, take out, history).
import { useState } from 'react'
import { TODAY, formatDateLabel, shortDate } from '../../lib/dates.js'

// ── Savings goals + sinking funds: add money, take out, history, edit (2026-11-12) ──
const money2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const parseMoney = (v) => money2(String(v ?? '').replace(/[$,\s]/g, ''))
// Whole months left until a YYYY-MM-DD date (at least 1); null when no date or already past
function monthsUntil(dateStr) {
  if (!dateStr) return null
  const ms = new Date(dateStr + 'T12:00:00') - new Date()
  return ms < 0 ? null : Math.max(1, Math.ceil(ms / (30.44 * 86400000)))
}

function MoneyMove({ name, current, fmt, onApply, onCancel }) {
  const [amt, setAmt] = useState('')
  const [note, setNote] = useState('')
  const n = parseMoney(amt)
  const ok = n > 0
  const go = (sign) => { if (ok) onApply(sign * n, note.trim()) }
  return (
    <div className="money-move">
      <div className="money-move-fields">
        <label>Amount<input type="text" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="$0.00" autoFocus aria-label={`Amount for ${name}`} onKeyDown={(e) => { if (e.key === 'Enter') go(1) }} /></label>
        <label><span>Note <span className="muted">(optional)</span></span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Paycheck, birthday money…" onKeyDown={(e) => { if (e.key === 'Enter') go(1) }} /></label>
      </div>
      <div className="money-move-actions">
        <button type="button" className="primary-btn" disabled={!ok} onClick={() => go(1)}>+ Add {ok ? fmt(n) : 'money'}</button>
        <button type="button" className="ghost-btn" disabled={!ok || !(Number(current) > 0)} onClick={() => go(-1)}>− Take out</button>
        <button type="button" className="money-move-cancel" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

// Shared card for a savings goal or sinking fund. Fields are generic; the parent maps them to its own keys.
function SavingsItem({ name, target, current, dueDate, history = [], color = 'var(--teal)', fmt, monthlyIncome = 0, onUpdate, onDelete }) {
  const [mode, setMode] = useState(null) // 'add' | 'edit' | 'history'
  const [draft, setDraft] = useState(null)
  const cur = money2(current), tgt = money2(target)
  const pct = tgt > 0 ? Math.min((cur / tgt) * 100, 100) : 0
  const remaining = money2(Math.max(0, tgt - cur))
  const months = monthsUntil(dueDate)
  const perMonth = months && remaining > 0 ? Math.ceil(remaining / months) : null
  const pastDue = dueDate && !months && remaining > 0
  const at20 = !dueDate && remaining > 0 && monthlyIncome > 0 ? Math.max(0.1, remaining / (monthlyIncome * 0.2)) : null

  const log = (delta, note) => [{ id: Date.now(), date: TODAY, amount: money2(delta), note }, ...(history || [])].slice(0, 100)
  const move = (delta, note) => {
    const next = money2(Math.max(0, cur + delta)), real = money2(next - cur)
    if (real) onUpdate({ current: next, history: log(real, note) })
    setMode(null)
  }
  const openEdit = () => { setDraft({ name, target: String(tgt || ''), current: String(cur || ''), dueDate: dueDate || '' }); setMode(mode === 'edit' ? null : 'edit') }
  const saveEdit = () => {
    if (!draft.name.trim() || !(parseMoney(draft.target) > 0)) return
    const nextCur = money2(Math.max(0, parseMoney(draft.current)))
    const patch = { name: draft.name.trim(), target: parseMoney(draft.target), dueDate: draft.dueDate, current: nextCur }
    if (nextCur !== cur) patch.history = log(nextCur - cur, 'Balance corrected')
    onUpdate(patch); setMode(null)
  }
  const toggle = (m) => setMode(mode === m ? null : m)

  return (
    <div className="sav-item">
      <div className="sav-head">
        <strong>{name}</strong>
        <button type="button" className="sav-x" onClick={() => { if (window.confirm(`Delete "${name}"? Its history goes with it.`)) onDelete() }} aria-label={`Delete ${name}`}>✕</button>
      </div>
      <div className="sav-amounts">
        <span className="sav-saved" style={{ color }}>{fmt(cur)}</span>
        <span className="muted">of {fmt(tgt)} · {pct.toFixed(0)}%</span>
      </div>
      <div className="sav-bar"><div style={{ width: `${pct}%`, background: color }} /></div>
      <p className="sav-hint">
        {remaining <= 0 ? <span className="sav-done">🎉 Goal reached</span>
          : perMonth ? <>Save <strong>{fmt(perMonth)}/month</strong> to reach it by {dueDate.slice(0, 4) === TODAY.slice(0, 4) ? shortDate(dueDate) : formatDateLabel(dueDate, { month: 'short', day: 'numeric', year: 'numeric' })} · {fmt(remaining)} to go</>
          : pastDue ? <>Target date passed · {fmt(remaining)} to go</>
          : at20 ? <>{fmt(remaining)} to go · about <strong>{at20.toFixed(1)} months</strong> saving 20% of this month's income</>
          : <>{fmt(remaining)} to go</>}
      </p>
      <div className="sav-actions">
        <button type="button" className={'sav-btn primary' + (mode === 'add' ? ' on' : '')} onClick={() => toggle('add')}>+ Add money</button>
        <button type="button" className={'sav-btn' + (mode === 'edit' ? ' on' : '')} onClick={openEdit}>Edit</button>
        {history.length > 0 && <button type="button" className={'sav-btn' + (mode === 'history' ? ' on' : '')} onClick={() => toggle('history')}>History ({history.length})</button>}
      </div>

      {mode === 'add' && <MoneyMove name={name} current={cur} fmt={fmt} onApply={move} onCancel={() => setMode(null)} />}
      {mode === 'edit' && draft && (
        <div className="money-move">
          <div className="sav-edit-grid">
            <label className="full">Name<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
            <label>Goal amount<input type="text" inputMode="decimal" value={draft.target} onChange={(e) => setDraft({ ...draft, target: e.target.value })} /></label>
            <label>Saved so far<input type="text" inputMode="decimal" value={draft.current} onChange={(e) => setDraft({ ...draft, current: e.target.value })} /></label>
            <label className="full"><span>Target date <span className="muted">(optional)</span></span><input type="date" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} /></label>
          </div>
          <div className="money-move-actions">
            <button type="button" className="primary-btn" onClick={saveEdit}>Save</button>
            <button type="button" className="money-move-cancel" onClick={() => setMode(null)}>Cancel</button>
          </div>
        </div>
      )}
      {mode === 'history' && (
        <ul className="sav-history">
          {history.slice(0, 20).map((h) => (
            <li key={h.id}>
              <span className="muted">{shortDate(h.date)}</span>
              <span className="sav-history-note">{h.note || (h.amount >= 0 ? 'Added' : 'Taken out')}</span>
              <strong className={h.amount >= 0 ? 'in' : 'out'}>{h.amount >= 0 ? '+' : '−'}{fmt(Math.abs(h.amount))}</strong>
            </li>
          ))}
          {history.length > 20 && <li className="muted">Showing the latest 20</li>}
        </ul>
      )}
    </div>
  )
}

export { money2, parseMoney, SavingsItem }

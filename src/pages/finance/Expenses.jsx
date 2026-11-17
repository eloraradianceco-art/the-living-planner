// Finance: money formatting, debt types, expense editor and rows.
import { useState } from 'react'
import { TODAY, shortDate } from '../../lib/dates.js'

const fmtMoney = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
// Debts are credit cards or loans. Older debts have no type: a name like "Visa" or "Credit Card" reads as a card.
const DEBT_TYPES = [['card', 'Credit card'], ['loan', 'Loan']]
const debtTypeOf = (d) => d?.type || (/credit|card|visa|master|amex|discover|capital one/i.test(String(d?.name || '')) ? 'card' : 'loan')
// Utilization: under 30% is healthy, 30–50% is worth watching, over 50% weighs on a credit score
const utilTone = (pct) => pct < 30 ? 'var(--success)' : pct <= 50 ? 'var(--warning,#f90)' : 'var(--danger)'
const EXPENSE_CATEGORIES = ['Food', 'Transport', 'Shopping', 'Entertainment', 'Health', 'Personal', 'Home', 'Bills', 'Other']
const EXPENSE_PERIODS = [['one-time', 'One-time'], ['weekly', 'Weekly'], ['biweekly', 'Every 2 weeks'], ['monthly', 'Monthly'], ['yearly', 'Yearly']]

// Edit a logged expense in place: what it was, amount, category, how often, date. Delete lives here too.
function ExpenseEditor({ expense, onSave, onDelete, onCancel }) {
  const [d, setD] = useState(() => ({
    description: expense.description || expense.note || '',
    amount: expense.amount == null ? '' : String(expense.amount),
    category: expense.category || 'Other',
    period: expense.period || 'one-time',
    date: expense.date || TODAY,
  }))
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setD((p) => ({ ...p, [k]: e.target.value }))
  const cats = EXPENSE_CATEGORIES.includes(d.category) ? EXPENSE_CATEGORIES : [d.category, ...EXPENSE_CATEGORIES]
  const amt = Number(d.amount)
  const valid = d.amount !== '' && Number.isFinite(amt) && amt >= 0
  const save = async () => {
    if (!valid || busy) return
    setBusy(true)
    const text = d.description.trim()
    try { await onSave({ ...expense, description: text || null, note: text, amount: amt, category: d.category, period: d.period, date: d.date || TODAY }) }
    catch { setBusy(false) }
  }
  const lbl = { display: 'grid', gap: 4, fontSize: '.72rem', fontWeight: 600, color: 'var(--ink2)', minWidth: 0 }
  return (
    <div className="expense-editor" style={{ background: 'var(--stone)', borderRadius: 12, padding: 12, margin: '6px 0 10px', display: 'grid', gap: 8 }}
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 8 }}>
        <label style={lbl}>What for<input value={d.description} onChange={set('description')} placeholder="e.g. Groceries" aria-label="Description" /></label>
        <label style={lbl}>Amount<input type="number" inputMode="decimal" min="0" step="0.01" value={d.amount} onChange={set('amount')} aria-label="Amount" /></label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 8 }}>
        <label style={lbl}>Category<select value={d.category} onChange={set('category')} aria-label="Category">{cats.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label style={lbl}>How often<select value={d.period} onChange={set('period')} aria-label="How often">{EXPENSE_PERIODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      </div>
      <label style={lbl}>{d.period === 'one-time' ? 'Date' : 'Starting'}<input type="date" value={d.date} onChange={set('date')} aria-label="Date" /></label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="primary-btn" style={{ flex: 1 }} disabled={!valid || busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="ghost-btn" onClick={onCancel}>Cancel</button>
        <button type="button" className="ghost-btn" style={{ color: 'var(--danger)' }}
          onClick={() => { if (window.confirm(`Delete "${d.description || expense.category || 'this expense'}"?`)) onDelete() }}>Delete</button>
      </div>
    </div>
  )
}

// One expense line: tap to edit it.
function ExpenseRow({ exp, editing, onEdit, onSave, onDelete, onCancel, extra }) {
  if (editing) return <ExpenseEditor expense={exp} onSave={onSave} onDelete={onDelete} onCancel={onCancel} />
  const repeating = exp.period && exp.period !== 'one-time'
  const periodLabel = (EXPENSE_PERIODS.find(([v]) => v === exp.period) || [])[1] || exp.period
  return (
    <button type="button" className="expense-row" onClick={onEdit} aria-label={`Edit ${exp.description || exp.category}, ${fmtMoney(exp.amount)}`}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 600, fontSize: '.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exp.description || exp.category}</span>
        <span className="muted" style={{ display: 'block', fontSize: '.75rem' }}>
          {exp.category}{exp.date ? ` · ${repeating ? 'from ' : ''}${shortDate(exp.date)}` : ''}
          {repeating && <span style={{ color: 'var(--teal)', marginLeft: 6, fontWeight: 600 }}>· {periodLabel}</span>}
          {extra}
        </span>
      </span>
      <strong style={{ color: 'var(--danger)', whiteSpace: 'nowrap' }}>{fmtMoney(exp.amount)}</strong>
      <span aria-hidden="true" style={{ color: 'var(--muted)', fontSize: '.85rem', paddingLeft: 2 }}>✎</span>
    </button>
  )
}

export { DEBT_TYPES, debtTypeOf, utilTone, ExpenseRow }

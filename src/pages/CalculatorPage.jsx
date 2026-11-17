// Calculator.
import { useEffect, useState } from 'react'
import { Receipt, Calculator, Copy } from 'lucide-react'
import { TODAY } from '../lib/dates.js'
import { PageNav } from '../components/PageNav.jsx'
import { PageHeader } from '../components/PageHeader.jsx'

// ── Calculator ──────────────────────────────────────────────────────────
// No eval: × and ÷ come before + and −. % works like a phone calculator:
// 200 + 10% = 220 (10% of what came before), 50 × 10% = 5. The tape keeps the
// last 20 results on this device.
const CALC_OPS = ['+', '−', '×', '÷']
const CALC_TAPE_KEY = 'planner_calc_tape'
const calcTokens = (expr) => String(expr).match(/-?(?:\d+\.?\d*|\.\d+)%?|[+−×÷]/g) || []
function calcEvaluate(expr) {
  const t = calcTokens(expr)
  while (t.length && CALC_OPS.includes(t[t.length - 1])) t.pop() // ignore a trailing operator
  if (!t.length || CALC_OPS.includes(t[0])) return null
  const val = (tok) => parseFloat(tok.replace('%', ''))
  const pct = (tok) => tok.endsWith('%')
  let total = 0, addOp = '+', term = pct(t[0]) ? val(t[0]) / 100 : val(t[0])
  for (let i = 1; i < t.length; i += 2) {
    const op = t[i], tok = t[i + 1]
    if (tok == null) break
    let v = val(tok)
    if (op === '×' || op === '÷') {
      if (pct(tok)) v = v / 100
      term = op === '×' ? term * v : term / v
    } else {
      total = addOp === '+' ? total + term : total - term
      if (pct(tok)) v = (total * v) / 100
      term = v; addOp = op
    }
  }
  total = addOp === '+' ? total + term : total - term
  return Number.isFinite(total) ? Number(total.toPrecision(12)) : NaN
}
function calcFormat(n) {
  if (n == null) return ''
  if (Number.isNaN(n)) return "Can't divide by 0"
  const a = Math.abs(n)
  if (a !== 0 && (a >= 1e15 || a < 1e-9)) return n.toExponential(6)
  return n.toLocaleString('en-US', { maximumFractionDigits: 10 })
}
// "12345.5" → "12,345.5" while typing (keeps a trailing "." and "%")
const calcPretty = (expr) => calcTokens(expr).map((tok) => {
  if (CALC_OPS.includes(tok)) return ` ${tok} `
  const m = tok.match(/^(-?)(\d*)(\.?\d*)(%?)$/)
  return m ? `${m[1]}${m[2] ? Number(m[2]).toLocaleString('en-US') : (m[3] ? '0' : '')}${m[3]}${m[4]}` : tok
}).join('')

function CalculatorPage({ onQuickCreate }) {
  const [expr, setExpr] = useState('')
  const [last, setLast] = useState(null) // { expr, result } after "="
  const [copied, setCopied] = useState(false)
  const [tape, setTape] = useState(() => { try { return JSON.parse(localStorage.getItem(CALC_TAPE_KEY) || '[]') } catch { return [] } })
  const saveTape = (next) => { setTape(next); try { localStorage.setItem(CALC_TAPE_KEY, JSON.stringify(next)) } catch {} }

  const lastNumber = (e) => (e.match(/-?(?:\d+\.?\d*|\.\d+)%?$/) || [''])[0]
  // One key press → the next expression (pure), plus "=" side effects below
  const nextExpr = (e0, k) => {
    let e = e0
    // After "=": a digit starts fresh, an operator continues from the result
    if (!e && last && !Number.isNaN(last.result) && (CALC_OPS.includes(k) || k === '%' || k === '±')) e = String(last.result)
    const end = e.slice(-1)
    if (k === '⌫') return e.slice(0, -1)
    if (/\d/.test(k)) {
      if (end === '%') return e
      const num = lastNumber(e)
      if (num === '0' || num === '-0') return e.slice(0, -1) + k
      return e + k
    }
    if (k === '.') {
      const num = lastNumber(e)
      if (num.includes('.') || end === '%') return e
      return e + (num && num !== '-' ? '.' : '0.')
    }
    if (CALC_OPS.includes(k)) {
      if (!e) return e
      if (CALC_OPS.includes(end) || end === '.') return e.slice(0, -1) + k
      return e + k
    }
    if (k === '%') return /[\d.]$/.test(e) ? e.replace(/\.$/, '') + '%' : e
    if (k === '±') {
      const num = lastNumber(e)
      if (!num) return e
      const start = e.length - num.length
      return e.slice(0, start) + (num.startsWith('-') ? num.slice(1) : '-' + num)
    }
    return e
  }
  const press = (k) => {
    setCopied(false)
    if (k === 'AC') { if (!expr) setLast(null); setExpr(''); return }
    if (k === '=') {
      const r = calcEvaluate(expr)
      if (r == null) return
      setLast({ expr, result: r })
      if (!Number.isNaN(r)) saveTape([{ expr, result: r, at: Date.now() }, ...tape].slice(0, 20))
      setExpr('')
      return
    }
    setExpr(nextExpr(expr, k))
  }

  // iPad / computer keyboard
  useEffect(() => {
    const onKey = (ev) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return
      const tag = (ev.target?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      const map = { '*': '×', x: '×', X: '×', '/': '÷', '-': '−', '+': '+', '=': '=', Enter: '=', Backspace: '⌫', Escape: 'AC', Delete: 'AC', '%': '%', '.': '.', ',': '.' }
      const k = /^\d$/.test(ev.key) ? ev.key : map[ev.key]
      if (!k) return
      ev.preventDefault(); press(k)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const preview = expr ? calcEvaluate(expr) : null
  const shown = expr ? preview : last ? last.result : 0
  const topLine = expr ? calcPretty(expr) : last ? `${calcPretty(last.expr)} =` : ''
  const usable = shown != null && !Number.isNaN(shown)
  const copy = async () => {
    try { await navigator.clipboard.writeText(String(shown)); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch {}
  }

  const KEYS = [
    ['AC', 'Clear', 'fn'], ['⌫', 'Delete', 'fn'], ['%', 'Percent', 'fn'], ['÷', 'Divide', 'op'],
    ['7'], ['8'], ['9'], ['×', 'Multiply', 'op'],
    ['4'], ['5'], ['6'], ['−', 'Subtract', 'op'],
    ['1'], ['2'], ['3'], ['+', 'Add', 'op'],
    ['±', 'Plus or minus', 'fn'], ['0'], ['.', 'Decimal point'], ['=', 'Equals', 'eq'],
  ]
  return (
    <div className="screen-stack">
      <PageHeader icon={Calculator} title="Calculator" subtitle="Quick math, ready to log as an expense" />
      <div className="calc-layout">
        <section className="card calc-card">
          <div className="calc-display">
            <div className="calc-expr" aria-hidden="true">{topLine || '\u00a0'}</div>
            <div className="calc-result" role="status" aria-live="polite" aria-label={`Result ${calcFormat(shown ?? 0)}`}>{calcFormat(shown ?? 0)}</div>
          </div>
          <div className="calc-keys">
            {KEYS.map(([k, label, kind]) => (
              <button key={k} type="button" className={'calc-key' + (kind ? ' ' + kind : '')} aria-label={label || k} onClick={() => press(k)}>{k}</button>
            ))}
          </div>
          <div className="calc-actions">
            <button type="button" className="ghost-btn" onClick={copy} disabled={!usable}>
              <Copy size={14} /> {copied ? 'Copied' : 'Copy'}
            </button>
            <button type="button" className="primary-btn" disabled={!usable || shown === 0}
              onClick={() => onQuickCreate('expense', { amount: Math.abs(Math.round(shown * 100) / 100).toFixed(2), date: TODAY })}>
              <Receipt size={14} /> Add as expense
            </button>
          </div>
        </section>
        <section className="card calc-tape">
          <div className="section-title-row">
            <h3 style={{ fontSize: '1rem' }}>Tape</h3>
            {tape.length > 0 && <button type="button" className="ghost-btn" style={{ fontSize: '.75rem', padding: '4px 10px' }} onClick={() => saveTape([])}>Clear</button>}
          </div>
          {tape.length === 0
            ? <p className="muted" style={{ fontSize: '.85rem', margin: 0 }}>Results show here. Tap one to use it again.</p>
            : <ul className="calc-tape-list">
                {tape.map((row) => (
                  <li key={row.at}>
                    <button type="button" onClick={() => { setLast(null); setExpr(String(row.result)) }} aria-label={`Use ${calcFormat(row.result)}`}>
                      <span className="calc-tape-expr">{calcPretty(row.expr)} =</span>
                      <span className="calc-tape-result">{calcFormat(row.result)}</span>
                    </button>
                  </li>
                ))}
              </ul>}
        </section>
      </div>
      <PageNav />
    </div>
  )
}

export { CalculatorPage }

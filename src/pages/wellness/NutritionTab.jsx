// Wellness: Nutrition tab.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChefHat } from 'lucide-react'
import { TODAY, addDays, formatDateLabel } from '../../lib/dates.js'
import { exKey } from './helpers.js'

const MEAL_SLOTS = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Shake']
const DEFAULT_TARGETS = { protein: 150, calories: '' }
const dayProtein = (meals, d) => (meals?.[d] || []).reduce((n, m) => n + (Number(m.protein) || 0), 0)
const dayCalories = (meals, d) => (meals?.[d] || []).reduce((n, m) => n + (Number(m.calories) || 0), 0)

function NutritionTab({ meals, onSaveMeals, targets, onSaveTargets, water }) {
  const [f, setF] = useState({ slot: 'Breakfast', name: '', protein: '', calories: '' })
  const [editTargets, setEditTargets] = useState(false)
  const [t, setT] = useState(targets)
  const today = meals[TODAY] || []
  const protein = dayProtein(meals, TODAY)
  const calories = dayCalories(meals, TODAY)
  const target = Number(targets.protein) || 0
  const pct = target ? Math.min(100, Math.round(protein / target * 100)) : 0

  // Recent distinct meals → one-tap re-log
  const favorites = useMemo(() => {
    const seen = new Map()
    Object.keys(meals).sort().reverse().forEach((d) => (meals[d] || []).forEach((m) => {
      const k = exKey(m.name); if (k && !seen.has(k)) seen.set(k, m)
    }))
    return [...seen.values()].slice(0, 8)
  }, [meals])

  const last7 = Array.from({ length: 7 }, (_, i) => addDays(TODAY, i - 6))
  const logged = last7.filter((d) => (meals[d] || []).length)
  const avg = logged.length ? Math.round(logged.reduce((n, d) => n + dayProtein(meals, d), 0) / logged.length) : 0
  const hits = target ? last7.filter((d) => dayProtein(meals, d) >= target).length : 0

  const add = (m) => {
    if (!m.name.trim() && !m.protein) return
    onSaveMeals({ ...meals, [TODAY]: [...today, { id: Date.now(), slot: m.slot, name: m.name.trim(), protein: m.protein, calories: m.calories }] })
  }

  return (
    <div className="screen-stack" style={{ gap: 14 }}>
      <section className="card">
        <div className="section-title-row" style={{ marginBottom: 10 }}>
          <div><p className="eyebrow">Nutrition</p><h3>Today's fuel</h3></div>
          <button className="ghost-btn" style={{ fontSize: '.78rem' }} onClick={() => { setT(targets); setEditTargets((v) => !v) }}>Targets</button>
        </div>

        {editTargets && (
          <div className="wl-form" style={{ marginTop: 0, marginBottom: 12 }}>
            <div className="wl-grid3" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <label>Protein (g/day)<input type="number" inputMode="numeric" value={t.protein} onChange={(e) => setT((p) => ({ ...p, protein: e.target.value }))} /></label>
              <label>Calories (optional)<input type="number" inputMode="numeric" value={t.calories} onChange={(e) => setT((p) => ({ ...p, calories: e.target.value }))} /></label>
            </div>
            <small className="muted">A common starting point for building muscle is about 0.7–1 g of protein per pound of bodyweight.</small>
            <button className="primary-btn" onClick={() => { onSaveTargets(t); setEditTargets(false) }}>Save targets</button>
          </div>
        )}

        <div className="nut-protein">
          <div className="nut-protein-top">
            <span><strong>{protein}</strong> / {target || '—'} g protein</span>
            <span className="muted">{target ? (protein >= target ? 'Target hit' : `${target - protein} g to go`) : 'Set a target'}</span>
          </div>
          <div className="nut-bar"><div style={{ width: `${pct}%` }} className={pct >= 100 ? 'hit' : ''} /></div>
          <div className="nut-mini">
            <span>{calories ? `${calories}${targets.calories ? ` / ${targets.calories}` : ''} cal` : 'Calories optional'}</span>
            <span>{today.length} meal{today.length !== 1 ? 's' : ''}</span>
            <span>Water {water || 0}/8 cups</span>
          </div>
        </div>

        <div className="wl-form">
          <div className="pain-chips">
            {MEAL_SLOTS.map((m) => <button key={m} type="button" className={'pain-chip' + (f.slot === m ? ' sel' : '')} onClick={() => setF((p) => ({ ...p, slot: m }))}>{m}</button>)}
          </div>
          <input placeholder="What did you eat?" value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} />
          <div className="wl-grid3" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <input type="number" inputMode="numeric" placeholder="Protein (g)" value={f.protein} onChange={(e) => setF((p) => ({ ...p, protein: e.target.value }))} />
            <input type="number" inputMode="numeric" placeholder="Calories" value={f.calories} onChange={(e) => setF((p) => ({ ...p, calories: e.target.value }))} />
          </div>
          <button className="primary-btn" onClick={() => { add(f); setF((p) => ({ ...p, name: '', protein: '', calories: '' })) }}>+ Log meal</button>
        </div>

        {favorites.length > 0 && (
          <>
            <p className="eyebrow" style={{ margin: '14px 0 6px' }}>Log again</p>
            <div className="pain-chips">
              {favorites.map((m) => (
                <button key={m.name} type="button" className="pain-chip" onClick={() => add({ ...m, slot: f.slot })}>
                  {m.name}{m.protein ? ` · ${m.protein}g` : ''}
                </button>
              ))}
            </div>
          </>
        )}

        {today.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {today.map((m) => (
              <div key={m.id} className="metric-row card-row">
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '.88rem' }}>{m.name || m.slot}</div>
                  <div className="muted" style={{ fontSize: '.74rem' }}>{m.slot}{m.calories ? ` · ${m.calories} cal` : ''}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {m.protein ? <strong style={{ color:'var(--brass-fg)', fontSize: '.88rem' }}>{m.protein}g</strong> : null}
                  <button className="time-card-del" aria-label="Remove meal" onClick={() => onSaveMeals({ ...meals, [TODAY]: today.filter((x) => x.id !== m.id) })}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <p className="eyebrow">Last 7 days</p>
        <div className="readiness-bars">
          {last7.map((d) => {
            const v = dayProtein(meals, d)
            const h = target ? Math.min(100, Math.round(v / target * 100)) : 0
            return (
              <div key={d} className="readiness-bar">
                <div className="readiness-bar-track"><div className={'readiness-bar-fill ' + (target && v >= target ? 'tone-good' : v ? 'tone-mid' : 'tone-none')} style={{ height: `${h}%` }} /></div>
                <span className="readiness-bar-val">{v || '–'}</span>
                <span className="readiness-bar-day">{formatDateLabel(d, { weekday: 'narrow' })}</span>
              </div>
            )
          })}
        </div>
        <p className="muted" style={{ fontSize: '.8rem', margin: '10px 0 0' }}>
          {logged.length ? `Average ${avg} g protein on days logged${target ? ` · target hit ${hits} of 7 days` : ''}.` : 'Log a few meals to see your week.'}
        </p>
        <div className="home-chip-row">
          <Link to="/lifestyle" className="home-chip"><ChefHat size={15} /> Recipes &amp; groceries</Link>
        </div>
      </section>
    </div>
  )
}

export { DEFAULT_TARGETS, dayProtein, NutritionTab }

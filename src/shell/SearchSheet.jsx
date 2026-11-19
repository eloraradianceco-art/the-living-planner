// Search everything.
import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Search } from 'lucide-react'
import { hasSupabaseEnv, supabase } from '../lib/supabase.js'
import { repeatLabel, shortDate, fmtRange } from '../lib/dates.js'
import { useAuth } from '../auth/AuthContext.jsx'

// ── Search everything ────────────────────────────────────────────────────
// Stored lists that live in page_data / faith_data: [source, key, label, route]
const SEARCH_SOURCES = [
  ['wellness', 'journalEntries', 'Journal', '/wellness?tab=journal'],
  ['wellness', 'appointments', 'Appointment', '/wellness?tab=care'],
  ['wellness', 'labs', 'Lab result', '/wellness?tab=care'],
  ['wellness', 'meds', 'Medication', '/wellness?tab=meds'],
  ['wellness', 'workouts', 'Workout', '/wellness?tab=training'],
  ['wellness', 'books', 'Book', '/growth'],
  ['lifestyle', 'recipes', 'Recipe', '/lifestyle?tab=recipes'],
  ['lifestyle', 'trips', 'Trip', '/lifestyle?tab=trips'],
  ['lifestyle', 'birthdays', 'Birthday', '/lifestyle?tab=birthdays'],
  ['lifestyle', 'gifts', 'Gift idea', '/lifestyle?tab=gifts'],
  ['productivity', 'checklists', 'Checklist', '/productivity?tab=checklists'],
  ['productivity', 'brainDump', 'Brain dump', '/productivity?tab=braindump'],
  ['productivity', 'mindMaps', 'Mind map', '/productivity?tab=mindmap'],
  ['faith', 'sermons', 'Sermon', '/faith?tab=sermons'],
  ['faith', 'prayers', 'Prayer', '/faith?tab=prayer'],
  ['faith', 'scriptures', 'Scripture', '/faith?tab=scripture'],
  ['faith', 'gratitude', 'Gratitude', '/faith?tab=gratitude'],
  ['faith', 'reflections', 'Reflection', '/faith?tab=past'],
]
const LOCAL_PREFIX = { wellness: 'planner.hw.', lifestyle: 'planner.l.', productivity: 'planner.p.', faith: 'planner.faith.' }
const TITLE_FIELDS = ['title', 'name', 'who', 'test', 'reference', 'text', 'request', 'label', 'type', 'verse']
function textOf(v, depth = 0) {
  if (v == null || depth > 3) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number') return ''
  if (Array.isArray(v)) return v.map((x) => textOf(x, depth + 1)).join(' ')
  if (typeof v === 'object') return Object.entries(v).filter(([k]) => !/^(id|date|at|created|updated|done|completed|color)/i.test(k) && !/^(parent|side|collapsed|taskId)$/.test(k)).map(([, x]) => textOf(x, depth + 1)).join(' ')
  return ''
}
function titleOf(o) {
  if (typeof o === 'string') return o.split('\n')[0].slice(0, 80)
  for (const f of TITLE_FIELDS) if (o && typeof o[f] === 'string' && o[f].trim()) return o[f].trim().slice(0, 80)
  return textOf(o).trim().slice(0, 80)
}
function snippet(hay, q) {
  const i = hay.toLowerCase().indexOf(q)
  if (i < 0) return ''
  const a = Math.max(0, i - 30), b = Math.min(hay.length, i + q.length + 50)
  return (a > 0 ? '…' : '') + hay.slice(a, b).replace(/\s+/g, ' ').trim() + (b < hay.length ? '…' : '')
}

function SearchSheet({ open, onClose, data, onOpenItem }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [stored, setStored] = useState([])
  const inputRef = React.useRef(null)

  // Load the lists that live outside the main tables each time search opens
  useEffect(() => {
    if (!open) return
    setTimeout(() => inputRef.current?.focus(), 80)
    const fromLocal = () => SEARCH_SOURCES.map(([page, key]) => {
      try { const v = localStorage.getItem(LOCAL_PREFIX[page] + key) ?? localStorage.getItem(key); return { page, key, value: v ? JSON.parse(v) : null } } catch { return { page, key, value: null } }
    })
    if (!user || !hasSupabaseEnv) { setStored(fromLocal()); return }
    const pageKeys = SEARCH_SOURCES.filter(([pg]) => pg !== 'faith').map(([, k]) => k)
    const faithKeys = SEARCH_SOURCES.filter(([pg]) => pg === 'faith').map(([, k]) => k)
    Promise.all([
      supabase.from('page_data').select('page,data_key,data_value').eq('user_id', user.id).in('data_key', pageKeys),
      supabase.from('faith_data').select('data_key,data_value').eq('user_id', user.id).in('data_key', faithKeys),
    ]).then(([pd, fd]) => {
      const rows = [
        ...(pd.data || []).map((r) => ({ page: r.page, key: r.data_key, value: r.data_value })),
        ...(fd.data || []).map((r) => ({ page: 'faith', key: r.data_key, value: r.data_value })),
      ]
      setStored(rows.length ? rows : fromLocal())
    }).catch(() => setStored(fromLocal()))
  }, [open, user?.id])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const results = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (query.length < 2) return []
    const out = []
    const add = (group, title, hay, go, sub) => {
      const h = `${title} ${hay}`.toLowerCase()
      if (!h.includes(query)) return
      const inTitle = title.toLowerCase().includes(query)
      out.push({ group, title, sub: inTitle ? (sub || '') : [sub, snippet(hay, query)].filter(Boolean).join(' · '), go, rank: inTitle ? 0 : 1 })
    }
    for (const t of data.tasks || []) add('Tasks', t.title || '', `${t.location || ''} ${t.notes || ''}`, () => onOpenItem('task', t), [t.date ? shortDate(t.date) : '', t.time ? fmtRange(t.time, t.endTime) : '', t.completed ? 'Done' : ''].filter(Boolean).join(' · '))
    for (const e of data.events || []) add('Events', e.title || '', `${e.location || ''} ${e.notes || ''}`, () => onOpenItem('event', e), [e.date ? shortDate(e.date) : '', e.startTime ? fmtRange(e.startTime, e.endTime) : '', e.recurrence && e.recurrence !== 'none' ? `↻ ${repeatLabel(e.recurrence)}` : ''].filter(Boolean).join(' · '))
    for (const g of data.goals || []) add('Goals', g.title || '', `${g.why || ''} ${g.description || ''} ${(g.steps || []).map((x) => x.text).join(' ')}`, () => onOpenItem('goal', g), g.category)
    for (const pr of data.projects || []) add('Projects', pr.title || '', `${pr.description || ''} ${(pr.steps || []).map((x) => x.text).join(' ')}`, () => onOpenItem('project', pr), pr.status)
    for (const n of data.notes || []) add('Notes', n.title || titleOf(n.content || ''), n.content || '', () => onOpenItem('note', n))
    for (const h of data.habits || []) add('Habits', h.title || '', '', () => { navigate('/habits'); onClose() })
    for (const src of SEARCH_SOURCES) {
      const [page, key, label, route] = src
      const row = stored.find((r) => r.page === page && r.key === key)
      if (!row || row.value == null) continue
      const go = (it) => () => { navigate(key === 'recipes' && it?.id ? `${route}&recipe=${it.id}` : route); onClose() }
      if (typeof row.value === 'string') { add(label, label, row.value, go()); continue }
      const items = Array.isArray(row.value) ? row.value : Object.values(row.value).flat()
      for (const it of items) if (it) add(label, titleOf(it), textOf(it), go(it), it.date ? shortDate(it.date) : (key === 'recipes' ? it.category : ''))
    }
    return out.sort((a, b) => a.rank - b.rank).slice(0, 60)
  }, [q, data, stored])

  const groups = results.reduce((m, r) => { (m[r.group] = m[r.group] || []).push(r); return m }, {})

  return (
    <div className={'menu-sheet-root' + (open ? ' open' : '')} aria-hidden={!open}>
      <div className="menu-backdrop" onClick={onClose} />
      <div className="menu-sheet search-sheet" role="dialog" aria-modal="true" aria-label="Search">
        <div className="search-bar">
          <Search size={18} />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks, notes, sermons, goals…" aria-label="Search everything" enterKeyHint="search" />
          <button className="menu-close" onClick={() => { setQ(''); onClose() }} aria-label="Close search"><X size={18} /></button>
        </div>
        {q.trim().length < 2 ? (
          <p className="muted search-hint">Search across tasks, events, goals, projects, notes, journal, sermons, prayers, scripture, recipes, trips, birthdays, books and more.</p>
        ) : results.length === 0 ? (
          <p className="muted search-hint">Nothing matches "{q.trim()}".</p>
        ) : Object.entries(groups).map(([g, rows]) => (
          <div key={g} className="search-group">
            <p className="side-group-label">{g}</p>
            {rows.map((r, i) => (
              <button key={g + i} className="search-result" onClick={() => { r.go(); onClose() }}>
                <strong>{r.title || g}</strong>
                {r.sub && <small>{r.sub}</small>}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export { SearchSheet }

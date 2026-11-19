// Faith page: devotional, prayer, scripture, reading plan, gratitude, fasting, sermons, goals.
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cross, Trash2, Search, Copy } from 'lucide-react'
import { hasSupabaseEnv, supabase } from '../../lib/supabase.js'
import { TODAY, addDays, formatDateLabel, shortDate } from '../../lib/dates.js'
import { emitPlannerData } from '../../lib/score.js'
import { getGoalProgress, nextStepFor } from '../../lib/steps.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { useUrlTab } from '../../shell/nav.js'
import { PRO_TABS, ProTabGate } from '../../components/Pro.jsx'
import { EmptyState } from '../../components/EmptyState.jsx'
import { FAITH_ICON_OVERRIDES, PageHeader, SectionPicker, TabNav } from '../../components/PageHeader.jsx'
import { useOwnWrites } from '../../lib/pageData.js'
import { getVerseOfDay } from './verses.js'

const FAITH_AREAS = ['Spiritual Growth', 'Prayer Life', 'Scripture Study', 'Community/Church', 'Service', 'Fasting', 'Evangelism', 'Discipleship']

// Today's Anchor verse, by day of the week (also labels each past reflection)
const FAITH_ANCHORS = [
  '"Trust in the Lord with all your heart and lean not on your own understanding." — Proverbs 3:5',
  '"I can do all things through Christ who strengthens me." — Philippians 4:13 NKJV',
  '"Be still and know that I am God." — Psalm 46:10',
  '"For I know the plans I have for you, declares the Lord, plans to prosper you." — Jeremiah 29:11',
  '"The Lord is my shepherd; I shall not want." — Psalm 23:1 KJV',
  '"Let your light shine before others, that they may see your good deeds." — Matthew 5:16',
  '"And we know that in all things God works for the good of those who love him." — Romans 8:28',
]
const anchorFor = (ymd) => FAITH_ANCHORS[new Date(ymd + 'T12:00:00').getDay() % 7]
// Reflections: one entry per day, newest first ([{ date, text }]). Older builds kept only today's ({ text, date }).
const sortReflections = (list) => [...list].sort((a, b) => String(b.date).localeCompare(String(a.date)))
function mergeReflections(list, ...more) {
  const out = [...(Array.isArray(list) ? list : [])]
  for (const extra of more) {
    const items = Array.isArray(extra) ? extra : (extra && extra.date ? [extra] : [])
    for (const r of items) if (r && r.date && String(r.text || '').trim() && !out.some((x) => x.date === r.date)) out.push({ date: r.date, text: r.text })
  }
  return sortReflections(out)
}

function PastReflections({ items, onDelete }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(() => new Set())
  const [limit, setLimit] = useState(10)
  const [copied, setCopied] = useState('')
  const ql = q.trim().toLowerCase()
  const shown = ql ? items.filter((r) => String(r.text).toLowerCase().includes(ql)) : items
  const toggle = (d) => setOpen((prev) => { const n = new Set(prev); n.has(d) ? n.delete(d) : n.add(d); return n })
  const label = (d) => formatDateLabel(d, { weekday: 'long', month: 'short', day: 'numeric', ...(d.slice(0, 4) !== TODAY.slice(0, 4) ? { year: 'numeric' } : {}) })
  const copy = async (r) => { try { await navigator.clipboard.writeText(`${label(r.date)}\n\n${r.text}`); setCopied(r.date); setTimeout(() => setCopied(''), 1500) } catch {} }
  return (
    <div className="reflect-past">
      <div className="reflect-past-head">
        <h4>Past Reflections</h4>
        {items.length > 0 && <span className="muted">{items.length} day{items.length === 1 ? '' : 's'}</span>}
      </div>
      {items.length === 0 ? (
        <p className="muted reflect-empty">Each day's reflection is kept here, newest first.</p>
      ) : (<>
        {items.length > 5 && (
          <div className="recipe-search"><Search size={15} /><input value={q} onChange={(e) => { setQ(e.target.value); setLimit(10) }} placeholder="Search your reflections" aria-label="Search reflections" /></div>
        )}
        <ul className="reflect-list">
          {shown.slice(0, limit).map((r) => {
            const isOpen = open.has(r.date)
            const ref = (anchorFor(r.date).split('—')[1] || '').trim()
            return (
              <li key={r.date} className={'reflect-item' + (isOpen ? ' open' : '')}>
                <button type="button" className="reflect-item-head" onClick={() => toggle(r.date)} aria-expanded={isOpen}>
                  <span className="reflect-date">{label(r.date)}</span>
                  {ref && <span className="reflect-anchor">{ref}</span>}
                </button>
                <p className="reflect-text" onClick={() => toggle(r.date)}>{r.text}</p>
                {isOpen && (
                  <div className="reflect-actions">
                    <button type="button" onClick={() => copy(r)}><Copy size={13} /> {copied === r.date ? 'Copied' : 'Copy'}</button>
                    <button type="button" className="danger" onClick={() => { if (window.confirm(`Delete your reflection from ${label(r.date)}?`)) onDelete(r.date) }}><Trash2 size={13} /> Delete</button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        {ql && shown.length === 0 && <p className="muted reflect-empty">No reflections match "{q.trim()}".</p>}
        {shown.length > limit && <button type="button" className="ghost-btn reflect-more" onClick={() => setLimit(limit + 20)}>Show older reflections</button>}
      </>)}
    </div>
  )
}

function FaithPage({ isPro = false, onUpgrade = () => {}, goals = [], tasks = [], projects = [], onCreateGoal, onEdit }) {
  const { user } = useAuth()

  // Faith data sync helper — saves to Supabase + localStorage backup.
  // Typed fields pass a delay so the account is written once you pause, not on every letter;
  // anything still waiting is sent right away when you leave the page or the app goes to the background.
  const own = useOwnWrites()
  const faithTimers = React.useRef({})
  const faithPending = React.useRef({})
  const syncFaith = React.useCallback((key, value, delay = 0) => {
    try { localStorage.setItem('planner.faith.' + key, JSON.stringify(value)) } catch {}
    emitPlannerData('faith', key, value)
    const at = own.mark(key)
    if (!user || !hasSupabaseEnv) return
    const send = () => {
      delete faithPending.current[key]
      supabase.from('faith_data').upsert({ user_id: user.id, data_key: key, data_value: value, updated_at: at }, { onConflict: 'user_id,data_key' })
        .then(({ error }) => { if (error) console.error('Faith sync error:', error) })
    }
    clearTimeout(faithTimers.current[key])
    if (delay) { faithPending.current[key] = send; faithTimers.current[key] = setTimeout(send, delay) }
    else send()
  }, [user?.id, own])
  React.useEffect(() => {
    const flush = () => Object.keys(faithPending.current).forEach((k) => { clearTimeout(faithTimers.current[k]); faithPending.current[k]?.() })
    const onVis = () => { if (document.visibilityState === 'hidden') flush() }
    document.addEventListener('visibilitychange', onVis); window.addEventListener('pagehide', flush)
    return () => { flush(); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', flush) }
  }, [syncFaith])

  // Load faith data from Supabase on mount
  React.useEffect(() => {
    if (!user || !hasSupabaseEnv) return
    supabase.from('faith_data')
      .select('data_key, data_value, updated_at')
      .eq('user_id', user.id)
      .then(({ data, error }) => {
        if (error || !data) return
        const latest = {}
        data.forEach(row => {
          if (!latest[row.data_key] || row.updated_at > latest[row.data_key].updated_at) {
            latest[row.data_key] = row
          }
        })
        // Skip any key changed on this device while the load was in flight (keeps what you just typed)
        const use = (k) => latest[k] && !own.isStale(k, latest[k].updated_at)
        if (use('prayers'))      setPrayers(latest.prayers.data_value || [])
        if (use('scriptures'))   setScriptures(latest.scriptures.data_value || [])
        if (use('gratitude'))    setGratitude(latest.gratitude.data_value || [])
        if (use('devotional'))   setDevotional(latest.devotional.data_value || { text: '', date: '' })
        if (use('fasting'))      setFasting(latest.fasting.data_value || { active: false, startDate: '', endDate: '', intention: '', log: [] })
        if (use('faithGoals'))   setFaithGoals(latest.faithGoals.data_value || [])
        if (use('sermons'))      setSermons(latest.sermons.data_value || [])
        if (use('bibleReading')) setBibleReading(latest.bibleReading.data_value || { plan: "M'Cheyne", completedDates: [], notes: {} })
        // Reflections: the account list is the source of truth once it exists (so a delete on one device sticks).
        // First time only: build it from the old single-day value and this device's copy, then save it.
        if (!own.isStale('reflections', latest.reflections?.updated_at)) {
          if (latest.reflections) setReflections(sortReflections(Array.isArray(latest.reflections.data_value) ? latest.reflections.data_value : []))
          else {
            const merged = mergeReflections(lsGet('reflections', []), latest.devotional?.data_value, lsGet('devotional', null))
            setReflections(merged)
            if (merged.length) syncFaith('reflections', merged)
          }
        }

        // ── One-time migration: push any localStorage data that never made it to Supabase ──
        // Runs silently — if Supabase already has the key, upsert will update it only if localStorage is newer
        const FAITH_KEYS = ['prayers','scriptures','gratitude','devotional','fasting','faithGoals','sermons','bibleReading','reflections']
        FAITH_KEYS.forEach(key => {
          if (!latest[key]) {
            // Nothing in Supabase for this key — check if localStorage has data to push up
            try {
              const raw = localStorage.getItem('planner.faith.' + key)
              if (!raw) return
              const parsed = JSON.parse(raw)
              const hasData = Array.isArray(parsed) ? parsed.length > 0 : parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0 && parsed !== '{}'
              if (hasData) {
                supabase.from('faith_data').upsert({
                  user_id: user.id, data_key: key, data_value: parsed,
                  updated_at: new Date().toISOString()
                }, { onConflict: 'user_id,data_key' }).then(() => {})
              }
            } catch {}
          }
        })
      })

    // Realtime subscription for faith data, plus a re-read when the app comes back from the background
    // (a sleeping phone misses live messages; 10-minute margin for device clocks)
    let hiddenAt = 0, alive = true
    const onVis = () => {
      if (document.visibilityState === 'hidden') { hiddenAt = hiddenAt || Date.now(); return }
      if (!hiddenAt) return
      const from = new Date(hiddenAt - 10 * 60000).toISOString()
      hiddenAt = 0
      supabase.from('faith_data').select('data_key, data_value, updated_at').eq('user_id', user.id).gt('updated_at', from)
        .then(({ data }) => { if (alive && data) data.forEach(applyFaithRow) })
    }
    document.addEventListener('visibilitychange', onVis)
    const channel = supabase
      .channel('faith_realtime_' + user.id)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'faith_data',
        filter: `user_id=eq.${user.id}`,
      }, payload => applyFaithRow(payload.new))
      .subscribe()
    function applyFaithRow(row) {
        if (!row || own.isStale(row.data_key, row.updated_at)) return   // our own save coming back
        if (row.data_key === 'reflections')  setReflections(sortReflections(Array.isArray(row.data_value) ? row.data_value : []))
        if (row.data_key === 'prayers')      setPrayers(row.data_value || [])
        if (row.data_key === 'scriptures')   setScriptures(row.data_value || [])
        if (row.data_key === 'gratitude')    setGratitude(row.data_value || [])
        if (row.data_key === 'devotional')   setDevotional(row.data_value || { text: '', date: '' })
        if (row.data_key === 'fasting')      setFasting(row.data_value || {})
        if (row.data_key === 'faithGoals')   setFaithGoals(row.data_value || [])
        if (row.data_key === 'sermons')      setSermons(row.data_value || [])
        if (row.data_key === 'bibleReading') setBibleReading(row.data_value || {})
    }

    return () => { alive = false; supabase.removeChannel(channel); document.removeEventListener('visibilitychange', onVis) }
  }, [user?.id])
  const lsGet = (k, d) => { try { const v = localStorage.getItem('planner.faith.' + k); return v ? JSON.parse(v) : d } catch { return d } }
  const lsSet = (k, v) => { try { localStorage.setItem('planner.faith.' + k, JSON.stringify(v)) } catch {} }

  const [tab, setTab] = useUrlTab('devotional')

  // Prayer journal state
  const [prayers, setPrayers] = useState(() => lsGet('prayers', []))
  const [newPrayer, setNewPrayer] = useState({ text: '', type: 'Request', answered: false })

  const savePrayers = (v) => { setPrayers(v); syncFaith('prayers', v) }

  // Scripture journal state
  const [scriptures, setScriptures] = useState(() => lsGet('scriptures', []))
  const [newScripture, setNewScripture] = useState({ reference: '', text: '', reflection: '' })
  const saveScriptures = (v) => { setScriptures(v); syncFaith('scriptures', v) }

  // Gratitude state
  const [gratitude, setGratitude] = useState(() => lsGet('gratitude', []))
  const [newGratitude, setNewGratitude] = useState('')
  const saveGratitude = (v) => { setGratitude(v); syncFaith('gratitude', v) }

  // Devotional journal
  const [devotional, setDevotional] = useState(() => lsGet('devotional', { text: '', date: '' }))
  const saveDevotional = (v, delay = 0) => { setDevotional(v); syncFaith('devotional', v, delay) }
  // Every day's reflection is kept (2026-11-13); the old single-day value is folded in
  const [reflections, setReflections] = useState(() => { const local = lsGet('reflections', null); return Array.isArray(local) ? sortReflections(local) : mergeReflections([], lsGet('devotional', null)) })
  const todayReflection = (reflections.find((r) => r.date === TODAY) || {}).text || ''
  const saveTodayReflection = (text) => {
    const rest = reflections.filter((r) => r.date !== TODAY)
    const next = String(text).trim() ? sortReflections([{ date: TODAY, text }, ...rest]) : rest
    setReflections(next); syncFaith('reflections', next, 600)
  }
  const deleteReflection = (date) => { const next = reflections.filter((r) => r.date !== date); setReflections(next); syncFaith('reflections', next) }

  // Fasting tracker
  const [fasting, setFasting] = useState(() => lsGet('fasting', { active: false, startDate: '', endDate: '', intention: '', log: [] }))
  const saveFasting = (v, delay = 0) => { setFasting(v); syncFaith('fasting', v, delay) }

  // Faith goals
  const [faithGoals, setFaithGoals] = useState(() => lsGet('faithGoals', []))
  const [newFaithGoal, setNewFaithGoal] = useState({ text: '', category: 'Spiritual Growth', done: false })
  const saveFaithGoals = (v) => { setFaithGoals(v); syncFaith('faithGoals', v) }
  // Faith goals now live in Goals (category "Faith"). Move any old ones over once.
  const movingGoals = React.useRef(false)
  useEffect(() => {
    if (!onCreateGoal || !faithGoals.length || movingGoals.current) return
    movingGoals.current = true
    ;(async () => {
      for (const g of faithGoals) {
        if (!g?.text) continue
        await onCreateGoal({ title: g.text, category: 'Faith', description: g.category || '', completed: !!g.done, timeframe: '1yr', targetDate: addDays(TODAY, 365), why: '', steps: [] })
      }
      saveFaithGoals([])
    })()
  }, [faithGoals.length])
  const faithAreaOf = (g) => g.description && FAITH_AREAS.includes(g.description) ? g.description : ''
  const myFaithGoals = (goals || []).filter((g) => g.category === 'Faith').sort((a, b) => Number(!!a.completed) - Number(!!b.completed))

  // Sermon notes
  const [sermons, setSermons] = useState(() => lsGet('sermons', []))
  const [bibleReading, setBibleReading] = useState(() => lsGet('bibleReading', { plan: 'M\'Cheyne', completedDates: [], notes: {} }))
  const saveBibleReading = (v, delay = 0) => { setBibleReading(v); syncFaith('bibleReading', v, delay) }
  const [readingNote, setReadingNote] = useState('')
  const [revealedVerse, setRevealedVerse] = useState(null)
  const [newSermon, setNewSermon] = useState({ date: TODAY, speaker: '', title: '', notes: '', application: '' })
  const saveSermons = (v) => { setSermons(v); syncFaith('sermons', v) }

  const todayGratitude = gratitude.filter(g => g.date === TODAY)
  const answeredPrayers = prayers.filter(p => p.answered).length

  const TABS = [
    { id: 'devotional', label: '📖 Devotional' },
    { id: 'prayer', label: '🙏 Prayer' },
    { id: 'scripture', label: '📜 Scripture' },
    { id: 'reading', label: '📚 Bible Reading' },
    { id: 'gratitude', label: '🌸 Gratitude' },
    { id: 'fasting', label: '⚡ Fasting' },
    { id: 'sermons', label: '🎙 Sermons' },
    { id: 'goals', label: '🎯 Faith Goals' },
  ]

  return (
    <div className="screen-stack">
      <PageHeader icon={Cross} title="Faith" subtitle="Abide. Pray. Grow." />

      {/* Stats strip */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:4}}>
        {[
          ['🙏', prayers.filter(p=>!p.answered).length, 'Active Prayers', 'var(--brass2)'],
          ['✅', answeredPrayers, 'Answered', 'var(--success)'],
          ['🌸', todayGratitude.length, 'Gratitude Today', 'var(--brass2)'],
        ].map(([emo,val,label,color]) => (
          <div key={label} style={{background:'var(--warm-white)',borderRadius:14,padding:'14px 8px 12px',textAlign:'center',border:'1px solid var(--border)',boxShadow:'0 1px 2px rgba(28,28,30,.04)'}}>
            <div aria-hidden="true" style={{fontSize:'1.35rem',lineHeight:1,marginBottom:6}}>{emo}</div>
            <div style={{fontWeight:800,fontSize:'1.2rem',color,lineHeight:1,marginBottom:2}}>{val}</div>
            <div style={{fontSize:'.65rem',color:'var(--muted)',fontWeight:600,letterSpacing:'.04em',textTransform:'uppercase'}}>{label}</div>
          </div>
        ))}
      </div>

      <SectionPicker tabs={TABS} activeTab={tab} onSelect={setTab} proTabs={PRO_TABS.faith} isPro={isPro} iconOverrides={FAITH_ICON_OVERRIDES} />

      {/* ── DEVOTIONAL ─────────────────────────────────────────────────────── */}
      {tab === 'devotional' && (
        <section className="card">
          {/* Verse of the Day */}
          {(() => {
            const vod = getVerseOfDay()
            return (
              <div style={{
                background: 'linear-gradient(135deg, var(--brass-dim) 0%, rgba(184,150,90,.1) 100%)',
                border: '1.5px solid rgba(184,150,90,.3)',
                borderRadius: 14, padding: '18px 20px', marginBottom: 16,
                position: 'relative',
              }}>
                <p style={{
                  fontSize: '.62rem', fontWeight: 700, letterSpacing: '.1em',
                  color:'var(--brass-fg)', textTransform: 'uppercase', marginBottom: 8,
                }}>Verse of the Day</p>
                <p style={{
                  fontFamily: "var(--serif)", fontSize: '1.02rem', lineHeight: 1.5,
                  color: 'var(--ink)', fontStyle: 'italic', marginBottom: 8,
                }}>"{vod.v}"</p>
                <p style={{fontSize: '.78rem', color:'var(--brass-fg)', fontWeight: 700, textAlign: 'right'}}>— {vod.r}</p>
                {(() => {
                  // Saves into Faith → Scripture (Scripture Journal), synced to the account (faith_data, key "scriptures").
                  const saved = scriptures.some((x) => x.reference === vod.r)
                  const pill = { marginTop: 10, padding: '7px 14px', borderRadius: 999, fontSize: '.78rem', fontWeight: 600, cursor: 'pointer' }
                  if (!isPro) return (
                    <button onClick={onUpgrade} style={{ ...pill, background: 'var(--brass-text)', color: 'white', border: 'none' }}
                      aria-label="Save to Scripture journal (Pro)">🔒 Save to Scripture · Pro</button>
                  )
                  return saved ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                      <span role="status" style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--success-text, var(--success))' }}>✓ Saved to your Scripture journal</span>
                      <button onClick={() => setTab('scripture')} style={{ ...pill, marginTop: 0, background: 'transparent', color: 'var(--brass-fg)', border: '1px solid var(--brass)' }}>View →</button>
                    </div>
                  ) : (
                    <button onClick={() => saveScriptures([{ id: Date.now(), reference: vod.r, text: vod.v, date: TODAY }, ...scriptures])}
                      style={{ ...pill, background: 'var(--brass-text)', color: 'white', border: 'none' }}>+ Save to Scripture</button>
                  )
                })()}
              </div>
            )
          })()}

          <p className="eyebrow">Daily Devotional</p>
          <h3 style={{ margin: '4px 0 8px' }}>Time with God</h3>
          <p className="muted" style={{fontSize:'.8rem',marginBottom:14}}>Use this space for your daily quiet time — reading, reflection, what God is speaking to you.</p>

          {/* Daily verse prompt */}
          <div style={{background:'var(--ink)',borderRadius:12,padding:'16px',marginBottom:16}}>
            <p className="eyebrow" style={{color:'var(--brass-fg)',marginBottom:6}}>Today's Anchor</p>
            {anchorFor(TODAY).split('—').map((part, i) => (
              i === 0
                ? <p key={i} style={{color:'white',fontSize:'.95rem',fontFamily:'var(--serif)',lineHeight:1.7,fontStyle:'italic',margin:'0 0 6px'}}>"{part.trim()}"</p>
                : <p key={i} style={{color:'var(--brass-fg)',fontSize:'.78rem',fontWeight:600,margin:0}}>— {part.trim()}</p>
            ))}
          </div>

          <p style={{fontWeight:600,fontSize:'.85rem',marginBottom:6}}>Today's Reflection — {formatDateLabel(TODAY, { weekday: 'long', month: 'short', day: 'numeric' })}</p>
          <textarea value={todayReflection} aria-label="Today's reflection"
            onChange={e => saveTodayReflection(e.target.value)}
            placeholder="What is God speaking to you today? What did you read? What are you sensing?"
            style={{width:'100%',minHeight:200,padding:'12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',
            fontSize:'.9rem',fontFamily:'var(--serif)',lineHeight:1.7,resize:'vertical',background:'var(--warm-white)',color:'var(--ink)',boxSizing:'border-box'}} />
          <p className="muted" style={{fontSize:'.75rem',marginTop:6}}>Saved automatically. A fresh page each morning; past days stay below.</p>
          <PastReflections items={reflections.filter((r) => r.date !== TODAY)} onDelete={deleteReflection} />
        </section>
      )}

      {/* ── PRAYER ─────────────────────────────────────────────────────────── */}
      {tab === 'prayer' && (
        <section className="card">
          <p className="eyebrow">Prayer Journal</p>
          <h3 style={{ margin: '4px 0 14px' }}>Your Prayer Life</h3>

          {/* Praise Reports — Answered Prayers */}
          {(() => {
            const answered = prayers.filter(p => p.answered)
            if (answered.length === 0) return null
            return (
              <div style={{
                background: 'linear-gradient(135deg, rgba(34,197,94,.08) 0%, rgba(34,197,94,.03) 100%)',
                border: '1.5px solid rgba(34,197,94,.25)',
                borderRadius: 14, padding: '14px 16px', marginBottom: 16,
              }}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                  <p style={{
                    fontSize: '.65rem', fontWeight: 700, letterSpacing: '.08em',
                    color: 'var(--success)', textTransform: 'uppercase', margin: 0,
                  }}>🙌 Praise Reports</p>
                  <strong style={{fontSize:'.78rem',color:'var(--success)'}}>{answered.length} answered</strong>
                </div>
                <p style={{fontSize:'.78rem',color:'var(--ink2)',marginBottom:10,fontStyle:'italic'}}>
                  "Give thanks to the Lord, for he is good; his love endures forever." — Psalm 107:1
                </p>
                {/* One list of answered prayers (the box showed blanks — it read p.title, prayers store p.text — and a second list repeated them) */}
                <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:260,overflow:'auto'}}>
                  {answered.slice().sort((x, y) => String(y.answeredDate || '').localeCompare(String(x.answeredDate || ''))).map(p => (
                    <div key={p.id} style={{fontSize:'.82rem',color:'var(--ink)',padding:'8px 10px',background:'rgba(255,255,255,.6)',borderRadius:8,borderLeft:'3px solid var(--success)',display:'flex',gap:8,alignItems:'flex-start'}}>
                      <div style={{flex:1,minWidth:0}}>
                        <strong style={{fontWeight:600}}>✓ {p.text || p.title || p.request}</strong>
                        {p.answeredDate && <div style={{fontSize:'.7rem',color:'var(--success)',fontWeight:600,marginTop:2}}>Answered {shortDate(p.answeredDate)}</div>}
                      </div>
                      <button aria-label="Move back to active" title="Not answered yet" onClick={() => savePrayers(prayers.map(x => x.id === p.id ? { ...x, answered: false, answeredDate: null } : x))}
                        style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',flexShrink:0,fontSize:'.85rem'}}>↺</button>
                      <button aria-label="Delete prayer" onClick={() => { if (window.confirm('Delete this answered prayer?')) savePrayers(prayers.filter(x => x.id !== p.id)) }}
                        style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',flexShrink:0}}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}


          {/* Active prayers */}
          <p style={{fontWeight:600,fontSize:'.85rem',marginBottom:8}}>Active Requests</p>
          {prayers.filter(p => !p.answered).length === 0 && (
            <p className="muted" style={{fontSize:'.82rem',marginBottom:12,fontStyle:'italic'}}>No active prayer requests. Add one below.</p>
          )}
          {prayers.filter(p => !p.answered).map((prayer, i) => (
            <div key={prayer.id} style={{padding:'12px',background:'var(--stone)',borderRadius:10,marginBottom:8}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:'.78rem',color:'var(--brass-fg)',fontWeight:600,marginBottom:4}}>{[prayer.type, prayer.date ? shortDate(prayer.date) : ''].filter(Boolean).join(' · ')}</div>
                  <div style={{fontSize:'.9rem',color:'var(--ink)',lineHeight:1.5}}>{prayer.text}</div>
                </div>
                <div style={{display:'flex',gap:6,flexShrink:0}}>
                  <button onClick={() => savePrayers(prayers.map(p => p.id===prayer.id ? {...p, answered:true, answeredDate:TODAY} : p))}
                    style={{background:'var(--success)',color:'white',border:'none',borderRadius:6,padding:'4px 8px',fontSize:'.72rem',cursor:'pointer',fontWeight:600}}>✓ Answered</button>
                  <button aria-label="Delete prayer" onClick={() => { if (window.confirm('Delete this prayer request?')) savePrayers(prayers.filter(p => p.id !== prayer.id)) }}
                    style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}}>✕</button>
                </div>
              </div>
            </div>
          ))}

          {/* Add prayer */}
          <div style={{marginTop:8,padding:'14px',background:'var(--stone)',borderRadius:10,display:'grid',gap:8}}>
            <p style={{fontWeight:600,fontSize:'.85rem',margin:0}}>Add Prayer Request</p>
            <select value={newPrayer.type} onChange={e => setNewPrayer(p => ({...p, type: e.target.value}))}
              style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}}>
              {['Request','Intercession','Praise','Thanksgiving','Confession'].map(t => <option key={t}>{t}</option>)}
            </select>
            <textarea value={newPrayer.text} onChange={e => setNewPrayer(p => ({...p, text: e.target.value}))}
              placeholder="What are you bringing before God?"
              style={{width:'100%',minHeight:90,padding:'10px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',
              fontSize:'.85rem',fontFamily:'var(--serif)',lineHeight:1.6,resize:'vertical',boxSizing:'border-box'}} />
            <button className="primary-btn" onClick={() => {
              if (!newPrayer.text.trim()) return
              savePrayers([{...newPrayer, id: Date.now(), date: TODAY}, ...prayers])
              setNewPrayer({ text: '', type: 'Request', answered: false })
            }}>+ Add Prayer</button>
          </div>
        </section>
      )}

      {/* ── SCRIPTURE ──────────────────────────────────────────────────────── */}
      {tab === 'scripture' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <section className="card">
          {/* Memory Verse Practice */}
          {scriptures.filter(s => s.memorizing).length > 0 && (
            <div style={{
              background: 'var(--brass-dim)',
              border: '1.5px solid rgba(184,150,90,.25)',
              borderRadius: 14, padding: '14px 16px', marginBottom: 16,
            }}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                <p style={{
                  fontSize: '.65rem', fontWeight: 700, letterSpacing: '.08em',
                  color:'var(--brass-fg)', textTransform: 'uppercase', margin: 0,
                }}>📚 Memorizing</p>
                <strong style={{fontSize:'.78rem',color:'var(--brass-fg)'}}>{scriptures.filter(s => s.memorized).length} of {scriptures.filter(s => s.memorizing).length} mastered</strong>
              </div>
              {scriptures.filter(s => s.memorizing && !s.memorized).slice(0, 3).map(s => {
                const isRevealed = revealedVerse === s.id
                // Create a fill-in-blank version (hide ~30% of words)
                const words = (s.text || s.verse || '').split(' ')
                const hidden = words.map((w, i) => i % 3 === 1 ? '___' : w).join(' ')
                return (
                  <div key={s.id} style={{
                    padding:'10px 12px',background:'rgba(255,255,255,.7)',
                    borderRadius:10,marginBottom:8,borderLeft:'3px solid var(--brass)',
                  }}>
                    <p style={{fontSize:'.85rem',fontFamily:'var(--serif)',fontStyle:'italic',lineHeight:1.5,marginBottom:6}}>
                      {isRevealed ? (s.text || s.verse) : hidden}
                    </p>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <p style={{fontSize:'.74rem',color:'var(--brass-fg)',fontWeight:700,margin:0}}>— {s.reference}</p>
                      <div style={{display:'flex',gap:6}}>
                        <button onClick={() => setRevealedVerse(isRevealed ? null : s.id)} style={{
                          fontSize:'.72rem',padding:'4px 10px',borderRadius:999,
                          background:'transparent',color:'var(--brass-fg)',
                          border:'1px solid var(--brass)',cursor:'pointer',fontWeight:600,
                        }}>{isRevealed ? 'Hide' : 'Reveal'}</button>
                        <button onClick={() => saveScriptures(scriptures.map(x => x.id === s.id ? {...x, memorized: true} : x))} style={{
                          fontSize:'.72rem',padding:'4px 10px',borderRadius:999,
                          background:'var(--success)',color:'white',
                          border:'none',cursor:'pointer',fontWeight:600,
                        }}>✓ Memorized</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <p className="eyebrow">Scripture Journal</p>
          <h3 style={{ margin: '4px 0 14px' }}>God's Word in Your Life</h3>
          {scriptures.length === 0 && <p className="muted" style={{marginBottom:16}}><EmptyState icon="📖" title="Hide the Word in your heart" message="Save a verse that speaks today. Return to it tomorrow." /></p>}
          {scriptures.map((s, i) => (
            <div key={s.id} style={{padding:'14px',background:'var(--stone)',borderRadius:10,marginBottom:10}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                <strong style={{color:'var(--brass-fg)',fontSize:'.85rem'}}>{s.reference}</strong>
                <div style={{display:'flex',gap:6}}>
                  <button onClick={() => saveScriptures(scriptures.map((x,j)=>j===i?{...x, memorizing: !x.memorizing, memorized: x.memorizing ? false : x.memorized}:x))}
                    style={{
                      background: s.memorizing ? 'var(--brass)' : 'transparent',
                      color: s.memorizing ? 'white' : 'var(--brass-fg)',
                      border: '1px solid var(--brass)', borderRadius: 999,
                      padding: '3px 10px', fontSize: '.7rem', fontWeight: 600,
                      cursor: 'pointer',
                    }}>{s.memorized ? '✓ Memorized' : s.memorizing ? '📚 Memorizing' : '+ Memorize'}</button>
                  <button aria-label="Remove verse" onClick={() => { if (window.confirm(`Remove ${s.ref || s.reference || 'this verse'} from your list?`)) saveScriptures(scriptures.filter((_,j)=>j!==i)) }}
                    style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}}>✕</button>
                </div>
              </div>
              <p style={{fontSize:'.9rem',fontFamily:'var(--serif)',lineHeight:1.7,margin:'0 0 8px',fontStyle:'italic',color:'var(--ink)'}}>{s.text || s.verse}</p>
              {s.reflection && <p style={{fontSize:'.82rem',color:'var(--ink2)',lineHeight:1.5,margin:0}}>💭 {s.reflection}</p>}
              <p className="muted" style={{fontSize:'.72rem',margin:'6px 0 0'}}>{s.date}</p>
            </div>
          ))}
          <div style={{marginTop:8,padding:'14px',background:'var(--stone)',borderRadius:10,display:'grid',gap:8}}>
            <p style={{fontWeight:600,fontSize:'.85rem',margin:0}}>Save a Scripture</p>
            <input placeholder="Reference (e.g. John 3:16)" value={newScripture.reference}
              onChange={e => setNewScripture(p => ({...p, reference: e.target.value}))}
              style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}} />
            <textarea placeholder="Verse text..." value={newScripture.text}
              onChange={e => setNewScripture(p => ({...p, text: e.target.value}))}
              style={{width:'100%',minHeight:80,padding:'10px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',
              fontSize:'.85rem',fontFamily:'var(--serif)',lineHeight:1.6,resize:'vertical',boxSizing:'border-box'}} />
            <textarea placeholder="Personal reflection on this verse..." value={newScripture.reflection}
              onChange={e => setNewScripture(p => ({...p, reflection: e.target.value}))}
              style={{width:'100%',minHeight:70,padding:'10px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',
              fontSize:'.85rem',fontFamily:'var(--serif)',lineHeight:1.6,resize:'vertical',boxSizing:'border-box'}} />
            <button className="primary-btn" onClick={() => {
              if (!newScripture.reference || !newScripture.text) return
              saveScriptures([{...newScripture, id: Date.now(), date: TODAY}, ...scriptures])
              setNewScripture({ reference: '', text: '', reflection: '' })
            }}>+ Save Scripture</button>
          </div>
        </section>
        </ProTabGate>
      )}

      {tab === 'reading' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <section className="card">
          <p className="eyebrow">Bible Reading</p>
          <h3 style={{margin:'4px 0 8px'}}>Daily Reading</h3>
          <p className="muted" style={{fontSize:'.8rem',marginBottom:14}}>
            "Man shall not live by bread alone, but by every word that comes from the mouth of God." — Matthew 4:4 ESV
          </p>

          {/* Plan selector */}
          <div style={{marginBottom:14}}>
            <p style={{fontSize:'.72rem',color:'var(--ink2)',fontWeight:600,letterSpacing:'.06em',textTransform:'uppercase',marginBottom:6}}>Reading Plan</p>
            <select value={bibleReading.plan || "M'Cheyne"}
              onChange={e => saveBibleReading({...bibleReading, plan: e.target.value})}
              style={{width:'100%',padding:'10px 12px',border:'1.5px solid var(--border2)',borderRadius:8,fontSize:'.9rem',background:'white'}}>
              <option value="Bible in a Year">Bible in a Year — Genesis to Revelation, daily</option>
              <option value="Chronological">Chronological — events in order they happened</option>
              <option value="M'Cheyne">M'Cheyne — 4 chapters daily (OT, NT, Psalms/Gospels)</option>
              <option value="F-260">F-260 — 1 chapter, 5 days/week (Foundations)</option>
              <option value="New Testament">New Testament Only — Matthew to Revelation</option>
              <option value="Psalms & Proverbs">Psalms & Proverbs daily</option>
              <option value="Custom">Custom — track on your own</option>
            </select>
          </div>

          {/* Today's check-in */}
          <div style={{background:'var(--brass-dim)',borderRadius:12,padding:'14px 16px',marginBottom:14}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
              <strong style={{fontSize:'.92rem',color:'var(--ink)'}}>Today's Reading</strong>
              <button onClick={() => {
                const completed = bibleReading.completedDates || []
                const has = completed.includes(TODAY)
                const next = has
                  ? completed.filter(d => d !== TODAY)
                  : [...completed, TODAY]
                saveBibleReading({...bibleReading, completedDates: next})
              }} style={{
                padding:'6px 14px', borderRadius:999, fontSize:'.8rem', fontWeight:700, cursor:'pointer',
                background: (bibleReading.completedDates||[]).includes(TODAY) ? 'var(--success)' : 'var(--brass-text)',
                color:'white', border:'none',
              }}>{(bibleReading.completedDates||[]).includes(TODAY) ? '✓ Done Today' : 'Mark Read'}</button>
            </div>
            <textarea
              placeholder="Notes from today's reading..."
              value={bibleReading.notes?.[TODAY] || ''}
              onChange={e => saveBibleReading({
                ...bibleReading,
                notes: {...(bibleReading.notes||{}), [TODAY]: e.target.value}
              }, 600)}
              style={{width:'100%',minHeight:80,padding:'10px',border:'1.5px solid rgba(184,150,90,.3)',borderRadius:8,fontSize:'.88rem',resize:'vertical',background:'white',fontFamily:'inherit'}} />
          </div>

          {/* Streak + stats */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:14}}>
            {(() => {
              const dates = (bibleReading.completedDates || []).sort()
              // Current streak
              let current = 0
              let day = TODAY
              if (!dates.includes(day)) day = addDays(day, -1)
              while (dates.includes(day)) {
                current++
                day = addDays(day, -1)
              }
              // Longest streak
              let longest = 0, run = 0
              for (let i = 0; i < dates.length; i++) {
                if (i === 0 || (new Date(dates[i]) - new Date(dates[i-1])) === 86400000) {
                  run++
                  longest = Math.max(longest, run)
                } else { run = 1 }
              }
              const total = dates.length
              return [
                ['Current Streak', current + 'd', current > 0 ? 'var(--warning)' : 'var(--muted)'],
                ['Longest', longest + 'd', 'var(--brass-fg)'],
                ['Total Days', total + '', 'var(--teal)'],
              ].map(([label, val, color]) => (
                <div key={label} style={{background:'var(--stone)',borderRadius:10,padding:'10px 4px',textAlign:'center'}}>
                  <div className="muted" style={{fontSize:'.65rem',fontWeight:600,letterSpacing:'.05em',textTransform:'uppercase',marginBottom:2}}>{label}</div>
                  <strong style={{color,fontSize:'1rem'}}>{val}</strong>
                </div>
              ))
            })()}
          </div>

          {/* Last 30 days visual */}
          <p style={{fontSize:'.72rem',color:'var(--ink2)',fontWeight:600,letterSpacing:'.06em',textTransform:'uppercase',marginBottom:8}}>Last 30 Days</p>
          <div style={{display:'grid',gridTemplateColumns:'repeat(10, 1fr)',gap:4}}>
            {Array.from({length: 30}).map((_, i) => {
              const date = addDays(TODAY, -(29 - i))
              const done = (bibleReading.completedDates || []).includes(date)
              return (
                <div key={i} title={date} style={{
                  aspectRatio:'1', borderRadius:6,
                  background: done ? 'var(--brass)' : 'var(--stone2)',
                  border: '1px solid ' + (done ? 'var(--brass)' : 'var(--border)'),
                }} />
              )
            })}
          </div>
        </section>
        </ProTabGate>
      )}

      {/* ── GRATITUDE ──────────────────────────────────────────────────────── */}
      {tab === 'gratitude' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <section className="card">
          <p className="eyebrow">Gratitude Journal</p>
          <h3 style={{ margin: '4px 0 8px' }}>Count Your Blessings</h3>
          <p className="muted" style={{fontSize:'.8rem',marginBottom:14}}>A grateful heart is a powerful heart. Log at least 3 things daily.</p>

          {/* Quick Gratitude */}
          <div style={{marginBottom:14}}>
            <p style={{fontSize:'.72rem',color:'var(--ink2)',fontWeight:600,letterSpacing:'.06em',textTransform:'uppercase',marginBottom:8}}>Quick Add</p>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(76px, 1fr))',gap:8}}>
              {[
                {icon:'👨‍👩‍👧', label:'Family'},
                {icon:'🏥', label:'Health'},
                {icon:'🏠', label:'Home'},
                {icon:'💼', label:'Work'},
                {icon:'🍞', label:'Food'},
                {icon:'🌅', label:'New Day'},
                {icon:'☮️', label:'Peace'},
                {icon:'🤝', label:'Friends'},
              ].map(({icon, label}) => (
                <button key={label} onClick={() => {
                  // Newest first like typed entries; tapping the same one twice in a day doesn't duplicate it
                  if (gratitude.some(g => g.date === TODAY && String(g.text).toLowerCase() === label.toLowerCase())) return
                  saveGratitude([{id: Date.now(), text: label, date: TODAY}, ...gratitude])
                }} style={{
                  display:'flex', flexDirection:'column', alignItems:'center', gap:4,
                  padding:'10px 6px', borderRadius:12, background:'var(--stone)',
                  border:'1.5px solid var(--border2)', cursor:'pointer',
                  transition:'all .15s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brass)'; e.currentTarget.style.background = 'var(--stone2)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.background = 'var(--stone)' }}
                >
                  <div style={{fontSize:'1.4rem'}}>{icon}</div>
                  <div style={{fontSize:'.7rem',color:'var(--ink2)',fontWeight:600,textAlign:'center'}}>{label}</div>
                </button>
              ))}
            </div>
          </div>
          <div style={{background:'var(--stone)',borderRadius:10,padding:'12px',marginBottom:14,display:'flex',justifyContent:'space-between'}}>
            <div><p className="muted" style={{fontSize:'.72rem',margin:'0 0 2px'}}>Today</p><strong style={{color:'var(--brass-fg)'}}>{todayGratitude.length} entries</strong></div>
            <div style={{textAlign:'right'}}><p className="muted" style={{fontSize:'.72rem',margin:'0 0 2px'}}>All time</p><strong>{gratitude.length} blessings</strong></div>
          </div>
          <div style={{display:'flex',gap:8,marginBottom:16}}>
            <input placeholder="What are you grateful for today?" value={newGratitude}
              onChange={e => setNewGratitude(e.target.value)}
              style={{flex:1,padding:'10px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.88rem'}}
              onKeyDown={e => { if (e.key==='Enter' && newGratitude.trim()) { saveGratitude([{text:newGratitude.trim(),date:TODAY,id:Date.now()}, ...gratitude]); setNewGratitude('') }}} />
            <button className="primary-btn" onClick={() => {
              if (!newGratitude.trim()) return
              saveGratitude([{text:newGratitude.trim(),date:TODAY,id:Date.now()}, ...gratitude])
              setNewGratitude('')
            }}>+ Add</button>
          </div>
          {[...gratitude].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || (Number(b.id) || 0) - (Number(a.id) || 0)).slice(0, 30).reduce((groups, item) => {
            const g = groups.find(g => g.date === item.date)
            if (g) g.items.push(item)
            else groups.push({ date: item.date, items: [item] })
            return groups
          }, [])

.map(group => (
            <div key={group.date} style={{marginBottom:14}}>
              <p style={{fontSize:'.78rem',fontWeight:700,color:'var(--brass-fg)',marginBottom:6}}>
                {group.date === TODAY ? 'Today' : group.date === addDays(TODAY, -1) ? 'Yesterday' : formatDateLabel(group.date, { weekday: 'short', month: 'short', day: 'numeric' })}
              </p>
              {group.items.map(item => (
                <div key={item.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
                  <span style={{fontSize:'.88rem',color:'var(--ink)'}}>{item.text}</span>
                  <button onClick={() => saveGratitude(gratitude.filter(g => g.id !== item.id))}
                    style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',marginLeft:8}}>✕</button>
                </div>
              ))}
            </div>
          ))}
        </section>
        </ProTabGate>
      )}

      {/* ── FASTING ────────────────────────────────────────────────────────── */}
      {tab === 'fasting' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <section className="card">
          <p className="eyebrow">Fasting Tracker</p>
          <h3 style={{ margin: '4px 0 8px' }}>Discipline & Consecration</h3>
          <p className="muted" style={{fontSize:'.8rem',marginBottom:16}}>Fasting is a powerful spiritual discipline. Track your intentions and stay accountable.</p>
          {fasting.active ? (
            <div style={{background:'var(--ink)',borderRadius:12,padding:'16px',marginBottom:16}}>
              <p style={{color:'var(--brass-fg)',fontWeight:700,fontSize:'.85rem',marginBottom:4}}>Active Fast</p>
              <p style={{color:'white',fontSize:'1rem',fontWeight:600,marginBottom:4}}>{fasting.intention || 'No intention set'}</p>
              <p style={{color:'rgba(255,255,255,.6)',fontSize:'.8rem'}}>
                {fasting.startDate ? shortDate(fasting.startDate) : ''} → {fasting.endDate ? shortDate(fasting.endDate) : 'Open'}
                {fasting.startDate && fasting.startDate <= TODAY ? ` · Day ${Math.round((Date.parse(TODAY + 'T12:00:00Z') - Date.parse(fasting.startDate + 'T12:00:00Z')) / 86400000) + 1}${fasting.endDate && fasting.endDate >= fasting.startDate ? ` of ${Math.round((Date.parse(fasting.endDate + 'T12:00:00Z') - Date.parse(fasting.startDate + 'T12:00:00Z')) / 86400000) + 1}` : ''}` : ''}
              </p>
              <button onClick={() => saveFasting({...fasting, active:false, log:[...fasting.log, {start:fasting.startDate,end:TODAY,intention:fasting.intention}]})}
                style={{marginTop:12,background:'var(--danger)',color:'white',border:'none',borderRadius:8,padding:'8px 16px',cursor:'pointer',fontWeight:600,fontSize:'.85rem'}}>
                End Fast
              </button>
            </div>
          ) : (
            <div style={{padding:'14px',background:'var(--stone)',borderRadius:10,marginBottom:16,display:'grid',gap:8}}>
              <p style={{fontWeight:600,fontSize:'.85rem',margin:0}}>Begin a Fast</p>
              <input placeholder="Intention / Purpose" value={fasting.intention || ''}
                onChange={e => saveFasting({...fasting, intention: e.target.value}, 600)}
                style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}} />
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                <div><p className="muted" style={{fontSize:'.72rem',margin:'0 0 4px'}}>Start Date</p>
                  <input type="date" value={fasting.startDate||TODAY} onChange={e => saveFasting({...fasting, startDate: e.target.value})}
                    style={{width:'100%',padding:'8px 10px',border:'1.5px solid var(--border2)',borderRadius:6,fontSize:'.85rem',boxSizing:'border-box'}} />
                </div>
                <div><p className="muted" style={{fontSize:'.72rem',margin:'0 0 4px'}}>End Date (optional)</p>
                  <input type="date" value={fasting.endDate||''} onChange={e => saveFasting({...fasting, endDate: e.target.value})}
                    style={{width:'100%',padding:'8px 10px',border:'1.5px solid var(--border2)',borderRadius:6,fontSize:'.85rem',boxSizing:'border-box'}} />
                </div>
              </div>
              <button className="primary-btn" onClick={() => saveFasting({...fasting, active:true, startDate: fasting.startDate||TODAY})}>Begin Fast</button>
            </div>
          )}
          {(fasting.log || []).length > 0 && (
            <div>
              <p style={{fontWeight:600,fontSize:'.85rem',marginBottom:8}}>Fast History</p>
              {(fasting.log || []).map((entry, i) => (
                <div key={i} style={{padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
                  <div style={{fontWeight:600,fontSize:'.88rem'}}>{entry.intention || 'Fast'}</div>
                  <div className="muted" style={{fontSize:'.75rem'}}>{entry.start ? shortDate(entry.start) : ''} → {entry.end ? shortDate(entry.end) : ''}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </ProTabGate>)}

      {/* ── SERMONS ────────────────────────────────────────────────────────── */}
      {tab === 'sermons' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <section className="card">
          <p className="eyebrow">Sermon Notes</p>
          <h3 style={{ margin: '4px 0 14px' }}>Capture What God Says</h3>
          {[...sermons].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).map((s, i) => (
            <div key={s.id || i} style={{padding:'14px',background:'var(--stone)',borderRadius:10,marginBottom:10}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
                <div>
                  <strong style={{fontSize:'.9rem'}}>{s.title || 'Untitled'}</strong>
                  <div className="muted" style={{fontSize:'.75rem'}}>{[s.speaker, s.date ? formatDateLabel(s.date, { month: 'short', day: 'numeric', year: 'numeric' }) : ''].filter(Boolean).join(' · ')}</div>
                </div>
                <button aria-label="Delete sermon note" onClick={() => { if(window.confirm('Delete this sermon note?')) saveSermons(sermons.filter((x)=>x!==s)) }}
                  style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',padding:'4px 8px',fontSize:'.85rem'}}>✕</button>
              </div>
              {s.notes && <p style={{fontSize:'.85rem',lineHeight:1.6,margin:'8px 0 6px',color:'var(--ink2)'}}>{s.notes}</p>}
              {s.application && <p style={{fontSize:'.82rem',color:'var(--teal)',margin:0}}>🎯 {s.application}</p>}
            </div>
          ))}
          <div style={{padding:'14px',background:'var(--stone)',borderRadius:10,display:'grid',gap:8}}>
            <p style={{fontWeight:600,fontSize:'.85rem',margin:0}}>New Sermon Notes</p>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <input placeholder="Speaker" value={newSermon.speaker} onChange={e => setNewSermon(p => ({...p, speaker: e.target.value}))}
                style={{padding:'9px 10px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}} />
              <input type="date" value={newSermon.date} onChange={e => setNewSermon(p => ({...p, date: e.target.value}))}
                style={{padding:'9px 10px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}} />
            </div>
            <input placeholder="Sermon title" value={newSermon.title} onChange={e => setNewSermon(p => ({...p, title: e.target.value}))}
              style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}} />
            <textarea placeholder="Key points, quotes, insights..." value={newSermon.notes} onChange={e => setNewSermon(p => ({...p, notes: e.target.value}))}
              style={{width:'100%',minHeight:100,padding:'10px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',
              fontSize:'.85rem',fontFamily:'var(--serif)',lineHeight:1.6,resize:'vertical',boxSizing:'border-box'}} />
            <textarea placeholder="How will I apply this?" value={newSermon.application} onChange={e => setNewSermon(p => ({...p, application: e.target.value}))}
              style={{width:'100%',minHeight:70,padding:'10px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',
              fontSize:'.85rem',fontFamily:'var(--serif)',lineHeight:1.6,resize:'vertical',boxSizing:'border-box'}} />
            <button className="primary-btn" onClick={() => {
              if (!newSermon.title && !newSermon.notes) return
              saveSermons([{...newSermon, id: Date.now()}, ...sermons])
              setNewSermon({ date: TODAY, speaker: '', title: '', notes: '', application: '' })
            }}>+ Save Notes</button>
          </div>
        </section>
      </ProTabGate>)}

      {/* ── FAITH GOALS (shared with Goals) ───────────────────────────────── */}
      {tab === 'goals' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <section className="card">
          <div className="section-title-row" style={{ marginBottom: 6 }}>
            <div><p className="eyebrow">Faith Goals</p><h3>Growing in the Spirit</h3></div>
            <Link className="ghost-btn" to="/goals" style={{ fontSize: '.8rem' }}>All goals →</Link>
          </div>
          <p className="muted" style={{ fontSize: '.8rem', margin: '0 0 12px' }}>These live in Goals too, so they get steps, progress and a place on Home.</p>
          {myFaithGoals.length === 0 && <EmptyState icon="✝️" title="What is God calling you to?" message="Spiritual growth is intentional. What is being asked of you in this season?" />}
          {myFaithGoals.map((g) => {
            const pct = getGoalProgress(g, tasks, projects)
            const next = nextStepFor(g, projects)
            return (
              <button key={g.id} className="faith-goal" onClick={() => onEdit && onEdit('goal', g)} style={g.completed ? { opacity: .6 } : undefined}>
                <div className="faith-goal-top">
                  <strong>{g.title}</strong>
                  <span>{g.completed ? 'Achieved' : `${pct}%`}</span>
                </div>
                {faithAreaOf(g) && <small className="muted">{faithAreaOf(g)}</small>}
                <div className="nut-bar" style={{ height: 5 }}><div style={{ width: `${pct}%` }} className={pct >= 100 ? 'hit' : ''} /></div>
                {next && !g.completed && <div className="home-next-step" style={{ marginTop: 2 }}><span>Next</span>{next}</div>}
              </button>
            )
          })}
          <div className="wl-form">
            <input placeholder="e.g. Read the Bible in a year" value={newFaithGoal.text} onChange={(e) => setNewFaithGoal((p) => ({ ...p, text: e.target.value }))} />
            <select value={newFaithGoal.category} onChange={(e) => setNewFaithGoal((p) => ({ ...p, category: e.target.value }))}>
              {FAITH_AREAS.map((c) => <option key={c}>{c}</option>)}
            </select>
            <button className="primary-btn" onClick={async () => {
              if (!newFaithGoal.text.trim() || !onCreateGoal) return
              await onCreateGoal({ title: newFaithGoal.text.trim(), category: 'Faith', description: newFaithGoal.category, completed: false, timeframe: '1yr', targetDate: addDays(TODAY, 365), why: '', steps: [] })
              setNewFaithGoal({ text: '', category: 'Spiritual Growth', done: false })
            }}>+ Add faith goal</button>
            <small className="muted">Tap a goal to add steps, a target date or your why.</small>
          </div>
        </section>
      </ProTabGate>)}
      <TabNav tabs={TABS} activeTab={tab} onSelect={setTab} />
    </div>
  )
}

export { FaithPage }

// Productivity: brain dump, notes, mind map, checklists, focus, tips.
import React, { useState } from 'react'
import MindMapTab from '../MindMap.jsx'
import { Zap } from 'lucide-react'
import { hasSupabaseEnv, supabase } from '../lib/supabase.js'
import { TODAY, shortDate } from '../lib/dates.js'
import { emitPlannerData } from '../lib/score.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { useUrlTab } from '../shell/nav.js'
import { PRO_TABS, ProTabGate } from '../components/Pro.jsx'
import { EmptyState } from '../components/EmptyState.jsx'
import { PageHeader, QuickAccessGrid, TabNav } from '../components/PageHeader.jsx'
import { useOwnWrites, useRemotePageData } from '../lib/pageData.js'

function NoteComposer({ onSave }) {
  const [title, setTitle] = React.useState('')
  const [body, setBody] = React.useState('')
  const [category, setCategory] = React.useState('General')
  const [open, setOpen] = React.useState(false)

  const save = () => {
    // A note with only a body is titled from its first line
    const t = title.trim() || body.trim().split('\n')[0].slice(0, 60)
    if (!t) return
    onSave({ id: Date.now(), title: t, content: body.trim(), category, date: TODAY })
    setTitle(''); setBody(''); setOpen(false)
  }

  if (!open) return (
    <button className="primary-btn" style={{width:'100%',marginBottom:12,fontSize:'.9rem'}}
      onClick={() => setOpen(true)}>+ New Note</button>
  )

  return (
    <div style={{background:'var(--stone)',borderRadius:12,padding:14,marginBottom:14,display:'grid',gap:8}}>
      <input placeholder="Title" value={title} onChange={e=>setTitle(e.target.value)} autoFocus
        style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.9rem',fontWeight:600}} />
      <textarea placeholder="Write your note..." value={body} onChange={e=>setBody(e.target.value)}
        style={{width:'100%',minHeight:100,padding:'10px 12px',border:'1.5px solid var(--border2)',
        borderRadius:'var(--radius-sm)',fontSize:'.88rem',lineHeight:1.6,resize:'vertical',
        fontFamily:'var(--serif)',boxSizing:'border-box'}} />
      <select value={category} onChange={e=>setCategory(e.target.value)}
        style={{padding:'8px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}}>
        {['General','Work','Personal','Faith','Health','Finance','Ideas'].map(c=><option key={c}>{c}</option>)}
      </select>
      <div style={{display:'flex',gap:8}}>
        <button className="primary-btn" style={{flex:1}} onClick={save}>Save Note</button>
        <button className="ghost-btn" style={{flex:1}} onClick={()=>setOpen(false)}>Cancel</button>
      </div>
    </div>
  )
}


function ProductivityPage({ tasks, notes: propNotes, onQuickCreate, onToggle, onEdit, onDelete, saveItem, settings, isPro = false, onUpgrade = () => {} }) {
  const { user } = useAuth()

  const ownPage = useOwnWrites()
  const syncPageData = React.useCallback(async (key, value) => {
    try { localStorage.setItem('planner.p.' + key, JSON.stringify(value)) } catch {}
    emitPlannerData('productivity', key, value)
    const at = ownPage.mark(key)
    if (!user || !hasSupabaseEnv) return
    try {
      await supabase.from('page_data').upsert({
        user_id: user.id, page: 'productivity', data_key: key, data_value: value,
        updated_at: at
      }, { onConflict: 'user_id,page,data_key' })
    } catch (e) { console.error('Productivity sync error:', e) }
  }, [user?.id, ownPage])

  React.useEffect(() => {
    if (!user || !hasSupabaseEnv) return
    supabase.from('page_data').select('data_key, data_value')
      .eq('user_id', user.id).eq('page', 'productivity')
      .then(({ data, error }) => {
        if (error || !data) return
        data.forEach(row => {
          if (ownPage.wrote(row.data_key)) return
          applyProductivity(row.data_key, row.data_value)
        })
      })
  }, [user?.id])
  const applyProductivity = (key, v) => {
    const set = {
      checklists: () => setChecklists(v || []), brainDump: () => setBrainDump(v || []),
      mindMaps: () => setMindMaps(Array.isArray(v) ? v : []),
    }[key]
    if (!set) return false
    set()
    return true
  }
  useRemotePageData('productivity', ownPage, (key, value) => {
    if (!applyProductivity(key, value)) return
    try { localStorage.setItem('planner.p.' + key, JSON.stringify(value)) } catch {}
    emitPlannerData('productivity', key, value)
  })

  const TABS = [
    { id: 'braindump', label: '🧠 Brain Dump' },
    { id: 'notes', label: '📝 Notes' },
    { id: 'mindmap', label: '🗺️ Mind Map' },
    { id: 'checklists', label: '📋 Checklists' },
    { id: 'focus', label: '⏱ Focus Timer' },
    { id: 'tips', label: '💡 Tips' },
  ]
  const lsGet = (k, d) => { try { const v = localStorage.getItem('planner.p.' + k); return v ? JSON.parse(v) : d } catch { return d } }
  const lsSet = (k, v) => { try { localStorage.setItem('planner.p.' + k, JSON.stringify(v)) } catch {} }

  const [tab, setTab] = useUrlTab('braindump')
  const [noteQuery, setNoteQuery] = useState('')
  const notes = propNotes || []
  // notes now come from Supabase via props - use saveItem
  const [checklists, setChecklists] = useState(() => lsGet('checklists', [{ id: 1, title: 'Work Checklist', items: [] }]))
  const [brainDump, setBrainDump] = useState(() => { try { const v = localStorage.getItem('planner.p.brainDump'); return v != null ? JSON.parse(v) : (localStorage.getItem('planner.p.braindump') || '') } catch { return '' } })
  // Typing updates the screen at once and saves after a short pause (was one save per keystroke,
  // which could land out of order); anything pending is saved when the app is hidden.
  const brainTimer = React.useRef(null), brainPending = React.useRef(null)
  const flushBrainDump = React.useCallback(() => { clearTimeout(brainTimer.current); if (brainPending.current != null) { syncPageData('brainDump', brainPending.current); brainPending.current = null } }, [syncPageData])
  const saveBrainDump = (v, now = false) => {
    setBrainDump(v); brainPending.current = v; ownPage.mark('brainDump')
    try { localStorage.setItem('planner.p.brainDump', JSON.stringify(v)) } catch {}
    clearTimeout(brainTimer.current)
    if (now) flushBrainDump(); else brainTimer.current = setTimeout(flushBrainDump, 700)
  }
  React.useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flushBrainDump() }
    document.addEventListener('visibilitychange', onHide); window.addEventListener('pagehide', flushBrainDump)
    return () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', flushBrainDump); flushBrainDump() }
  }, [flushBrainDump])
  // Focus timer runs off an end time, so it stays right when the phone locks or the app is in the background
  // (a 1-second counter pauses there). Break presets no longer change the focus length.
  const [focusWorkMins, setFocusWorkMins] = useState(25)
  const [focusBreakMins, setFocusBreakMins] = useState(5)
  const [focusMode, setFocusMode] = useState('work')
  const [focusSessions, setFocusSessions] = useState(0)
  const [focusEndsAt, setFocusEndsAt] = useState(null)        // ms timestamp while running
  const [focusLeft, setFocusLeft] = useState(25 * 60)          // seconds left while paused
  const [, focusTick] = useState(0)
  const focusRunning = focusEndsAt != null
  const focusTimeLeft = focusRunning ? Math.max(0, Math.ceil((focusEndsAt - Date.now()) / 1000)) : focusLeft
  const focusChime = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      ;[0, 0.25, 0.5].forEach((t) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 880; g.gain.setValueAtTime(0.18, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.22); o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.24) })
      if (navigator.vibrate) navigator.vibrate([200, 100, 200])
    } catch {}
  }
  React.useEffect(() => {
    if (!focusRunning) return undefined
    const id = setInterval(() => {
      if (Date.now() < focusEndsAt) { focusTick((n) => n + 1); return }
      setFocusEndsAt(null)
      focusChime()
      if (focusMode === 'work') {
        const done = focusSessions + 1
        setFocusSessions(done)
        setFocusMode('break')
        setFocusLeft((done % 4 === 0 ? Math.max(15, focusBreakMins) : focusBreakMins) * 60)   // every 4th session: a longer break
      } else {
        setFocusMode('work')
        setFocusLeft(focusWorkMins * 60)
      }
    }, 500)
    return () => clearInterval(id)
  }, [focusRunning, focusEndsAt, focusMode, focusSessions, focusWorkMins, focusBreakMins])
  const toggleFocus = () => {
    if (focusRunning) { setFocusLeft(focusTimeLeft); setFocusEndsAt(null) }
    else setFocusEndsAt(Date.now() + focusTimeLeft * 1000)
  }
  const focusPreset = (mins, mode) => {
    setFocusEndsAt(null); setFocusMode(mode); setFocusLeft(mins * 60)
    if (mode === 'work') setFocusWorkMins(mins); else setFocusBreakMins(mins)
  }
  const focusMinutes = Math.floor(focusTimeLeft / 60)
  const focusSeconds = focusTimeLeft % 60
  const focusTotal = Math.max(1, focusMode === 'work' ? focusWorkMins * 60 : Math.max(focusLeft, focusBreakMins * 60))
  const focusDisplay = `${String(focusMinutes).padStart(2,'0')}:${String(focusSeconds).padStart(2,'0')}`
  const focusProgress = Math.max(0, Math.min(100, Math.round(((focusTotal - focusTimeLeft) / focusTotal) * 100)))
  const focusReset = () => { setFocusEndsAt(null); setFocusMode('work'); setFocusLeft(focusWorkMins * 60) }

  const [newChecklist, setNewChecklist] = useState('')
  const [newItem, setNewItem] = useState({})

  const saveChecklists = (c) => { setChecklists(c); syncPageData('checklists', c) }
  // Mind maps: a list of maps, each a flat list of ideas (see MindMap.jsx)
  const [mindMaps, setMindMaps] = useState(() => { const v = lsGet('mindMaps', []); return Array.isArray(v) ? v : [] })
  const saveMindMaps = (v) => { setMindMaps(v); syncPageData('mindMaps', v) }
  const mindMapTask = (text) => saveItem('task', { title: text, date: TODAY, time: '', endTime: '', category: 'Productivity', linkedGoalId: '', linkedProjectId: '', priority: 'Medium', completed: false, recurrence: 'none' }, 'create')


  return (
    <div className="screen-stack">
      <PageHeader icon={Zap} title="Productivity" subtitle="Do the work that matters" />
      <QuickAccessGrid tabs={TABS} activeTab={tab} onSelect={setTab} proTabs={PRO_TABS.productivity} isPro={isPro} />


      {tab === 'braindump' && (
        <section className="card">
          <p className="eyebrow">Brain Dump</p>
          <h3 style={{ margin: '4px 0 8px' }}>Clear Your Head</h3>
          <p className="muted" style={{fontSize:'.8rem',marginBottom:10}}>Dump everything here — ideas, worries, random thoughts, to-do items, anything taking up mental space. Get it out.</p>
          <textarea value={brainDump} onChange={e => saveBrainDump(e.target.value)}
            placeholder="Start typing freely... no structure needed."
            style={{ width: '100%', minHeight: 300, padding: 14, border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', fontSize: '.9rem', fontFamily: 'var(--serif)', lineHeight: 1.7, resize: 'vertical', background: 'var(--warm-white)', color: 'var(--ink)', boxSizing: 'border-box' }} />
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:8}}>
            <p style={{ fontSize: '.75rem', color: 'var(--muted)', margin:0 }}>Saved automatically as you type.</p>
            <button onClick={()=>{ if (String(brainDump || '').trim() && window.confirm('Clear your whole brain dump? This can\'t be undone.')) saveBrainDump('', true) }} style={{background:'none',border:'1px solid var(--border)',borderRadius:6,padding:'4px 10px',fontSize:'.75rem',color:'var(--muted)',cursor:'pointer'}}>Clear</button>
          </div>
        </section>
      )}

      {tab === 'focus' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <section className="card">
          <p className="eyebrow">Focus Timer</p>
          <h3 style={{ margin: '4px 0 8px' }}>Pomodoro Technique</h3>
          <p className="muted" style={{fontSize:'.8rem',marginBottom:20}}>25 min focused work, 5 min break. Repeat. After 4 sessions take a longer break.</p>

          {/* Timer display */}
          <div style={{textAlign:'center',marginBottom:24}}>
            <div style={{
              width:180,height:180,borderRadius:'50%',margin:'0 auto 16px',
              background: focusMode==='work' ? 'var(--ink)' : 'var(--success)',
              display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
              boxShadow:`0 0 0 6px ${focusMode==='work' ? 'var(--ink)' : 'var(--success)'}22`,
              position:'relative', overflow:'hidden'
            }}>
              <div style={{fontSize:'.75rem',color:'rgba(255,255,255,.6)',letterSpacing:'.1em',textTransform:'uppercase',marginBottom:4}}>
                {focusMode==='work' ? 'Focus' : 'Break'}
              </div>
              <div style={{fontSize:'3rem',fontWeight:700,color:'white',fontFamily:'var(--sans)',lineHeight:1}}>{focusDisplay}</div>
              <div style={{fontSize:'.72rem',color:'rgba(255,255,255,.5)',marginTop:4}}>{focusSessions} sessions done</div>
              {/* Progress arc */}
              <div style={{position:'absolute',inset:0,borderRadius:'50%',
                background:`conic-gradient(${focusMode==='work'?'var(--brass)':'var(--success)'} ${focusProgress}%, transparent 0)`,
                opacity:.3,pointerEvents:'none'}}/>
            </div>

            {/* Controls */}
            <div style={{display:'flex',gap:12,justifyContent:'center',marginBottom:16}}>
              <button onClick={toggleFocus} style={{
                padding:'12px 28px',borderRadius:999,fontSize:'1rem',fontWeight:700,cursor:'pointer',
                background: focusRunning ? 'var(--danger)' : 'var(--ink)',
                color:'white',border:'none'
              }}>{focusRunning ? '⏸ Pause' : '▶ Start'}</button>
              <button onClick={focusReset}
                style={{padding:'12px 20px',borderRadius:999,fontSize:'1rem',cursor:'pointer',background:'var(--stone)',border:'1.5px solid var(--border)',color:'var(--ink)',fontWeight:600}}>↺ Reset</button>
            </div>

            {/* Mode presets */}
            <div style={{display:'flex',gap:8,justifyContent:'center',flexWrap:'wrap'}}>
              {[['Pomodoro',25,'work'],['Short Break',5,'break'],['Long Break',15,'break'],['Deep Work',50,'work'],['Quick',15,'work']].map(([label,mins,mode])=>(
                <button key={label} onClick={()=>focusPreset(mins, mode)}
                    style={{padding:'6px 12px',borderRadius:999,fontSize:'.78rem',cursor:'pointer',
                    border:'1.5px solid var(--border2)',background:'var(--stone)',color:'var(--ink)',fontWeight:500}}>
                    {label} · {mins}m</button>
              ))}
            </div>
          </div>

          {/* Tips */}
          <div style={{background:'var(--stone)',borderRadius:10,padding:'14px'}}>
            <p style={{fontWeight:700,fontSize:'.85rem',marginBottom:8}}>Why Pomodoro Works</p>
            {[
              'Time pressure creates urgency — you work faster knowing the clock is running.',
              'Forced breaks prevent mental fatigue and sustain output over hours.',
              'Tracking sessions builds a visible record of deep work completed.',
            ].map((tip,i)=>(
              <div key={i} style={{display:'flex',gap:8,marginBottom:6,fontSize:'.8rem',color:'var(--ink2)'}}>
                <span style={{color:'var(--brass-fg)',fontWeight:700}}>{i+1}.</span>{tip}
              </div>
            ))}
          </div>
        </section>
      </ProTabGate>)}


      {tab === 'mindmap' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade} title="Mind Map is part of Pro"
          text="Put one idea in the center and branch out. Plan a goal, take sermon notes, think through a decision."
          points={['Templates for goals, sermons, decisions, business ideas and projects', 'Turn any branch into a task', 'Map or outline view, copy as text']}>
          <MindMapTab maps={mindMaps} onSave={saveMindMaps} tasks={tasks} onMakeTask={mindMapTask} />
        </ProTabGate>
      )}

      {tab === 'checklists' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <>
          {checklists.map((cl, ci) => (
            <section key={cl.id} className="card">
              <div className="section-title-row">
                <h3 style={{ fontSize: '1rem' }}>{cl.title}{cl.items.length ? <span className="muted" style={{ fontSize: '.75rem', fontWeight: 500, marginLeft: 8 }}>{cl.items.filter((it) => it.done).length}/{cl.items.length}</span> : null}</h3>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  {cl.items.some((it) => it.done) && (
                    <button onClick={() => saveChecklists(checklists.map((c, cIdx) => cIdx !== ci ? c : { ...c, items: c.items.map((it) => ({ ...it, done: false })) }))}
                      style={{ background: 'none', border: 'none', color: 'var(--teal)', cursor: 'pointer', fontSize: '.8rem', fontWeight: 600 }}>Uncheck all</button>
                  )}
                  <button onClick={() => { if (window.confirm(`Remove the "${cl.title}" checklist and its ${cl.items.length} item${cl.items.length === 1 ? '' : 's'}?`)) saveChecklists(checklists.filter((_, i) => i !== ci)) }}
                    style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '.85rem' }}>Remove</button>
                </div>
              </div>
              {cl.items.map((item, ii) => (
                <div key={ii} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--surface)' }}>
                  <div onClick={() => {
                    const updated = checklists.map((c, cIdx) => cIdx !== ci ? c : { ...c, items: c.items.map((it, iIdx) => iIdx !== ii ? it : { ...it, done: !it.done }) })
                    saveChecklists(updated)
                  }} style={{ width: 22, height: 22, borderRadius: 6, border: '2px solid', borderColor: item.done ? 'var(--teal)' : 'var(--border2)', background: item.done ? 'var(--teal)' : 'transparent', display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
                    {item.done && <span style={{ color: 'var(--navy)', fontWeight: 700, fontSize: '.8rem' }}>✓</span>}
                  </div>
                  <span style={{ flex: 1, fontSize: '.9rem', textDecoration: item.done ? 'line-through' : 'none', color: item.done ? 'var(--muted)' : 'var(--text)' }}>{item.label}</span>
                  <button onClick={() => saveChecklists(checklists.map((c, cIdx) => cIdx !== ci ? c : { ...c, items: c.items.filter((_, iIdx) => iIdx !== ii) }))}
                    style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>✕</button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <input placeholder="Add item..." value={newItem[cl.id] || ''}
                  onChange={e => setNewItem(p => ({ ...p, [cl.id]: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter' && String(newItem[cl.id] || '').trim()) { saveChecklists(checklists.map((c, cIdx) => cIdx !== ci ? c : { ...c, items: [...c.items, { label: newItem[cl.id].trim(), done: false }] })); setNewItem(p => ({ ...p, [cl.id]: '' })) } }}
                  style={{ flex: 1, padding: '8px 10px', border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', fontSize: '.85rem' }} />
                <button className="primary-btn" style={{ padding: '8px 14px', fontSize: '.82rem' }}
                  onClick={() => { if (!newItem[cl.id]) return; saveChecklists(checklists.map((c, cIdx) => cIdx !== ci ? c : { ...c, items: [...c.items, { label: newItem[cl.id], done: false }] })); setNewItem(p => ({ ...p, [cl.id]: '' })) }}>Add</button>
              </div>
            </section>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <input placeholder="New checklist name..." value={newChecklist} onChange={e => setNewChecklist(e.target.value)}
              style={{ flex: 1, padding: '10px 12px', border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', fontSize: '.88rem' }} />
            <button className="primary-btn" style={{ padding: '10px 16px', fontSize: '.85rem' }}
              onClick={() => { if (!newChecklist) return; saveChecklists([...checklists, { id: Date.now(), title: newChecklist, items: [] }]); setNewChecklist('') }}>Create</button>
          </div>
        </>
      </ProTabGate>)}



            {tab === 'notes' && (
        <section className="card">
          <p className="eyebrow">Notes</p>
          <h3 style={{margin:'4px 0 14px'}}>My Notes</h3>

          {/* Add note form */}
          <NoteComposer onSave={(note) => saveItem('note', note, 'create')} />

          {/* Search */}
          <input placeholder="Search notes..." value={noteQuery} onChange={e=>setNoteQuery(e.target.value)}
            style={{width:'100%',padding:'9px 12px',border:'1.5px solid var(--border2)',
            borderRadius:'var(--radius-sm)',fontSize:'.85rem',marginBottom:12,boxSizing:'border-box'}} />

          {/* Notes list */}
          {notes.filter(n => !noteQuery || n.title?.toLowerCase().includes(noteQuery.toLowerCase()) || (n.content||'').toLowerCase().includes(noteQuery.toLowerCase())).length === 0
            ? <EmptyState icon="📝" title="Thoughts deserve a home" message="Capture what comes to mind. Reflect later. Watch patterns emerge." />
            : notes.filter(n => !noteQuery || n.title?.toLowerCase().includes(noteQuery.toLowerCase()) || (n.content||'').toLowerCase().includes(noteQuery.toLowerCase()))
              // Pinned first, then newest (they arrived in random id order)
              .slice().sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || String(b.date || b.created_at || '').localeCompare(String(a.date || a.created_at || '')) || String(b.created_at || '').localeCompare(String(a.created_at || '')))
              .map(note => (
                <div key={note.id} style={{padding:'12px 0',borderBottom:'1px solid var(--border)'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:600,fontSize:'.9rem',marginBottom:4}}>{note.title}</div>
                      {note.content && <div style={{fontSize:'.85rem',color:'var(--ink2)',lineHeight:1.6,whiteSpace:'pre-wrap'}}>{note.content}</div>}
                      <div className="muted" style={{fontSize:'.72rem',marginTop:4}}>{[note.category||'General', note.date ? shortDate(String(note.date).slice(0, 10)) : ''].filter(Boolean).join(' · ')}</div>
                    </div>
                    <div style={{display:'flex',gap:6,flexShrink:0}}>
                      <button onClick={() => onEdit('note', note)}
                        title="Edit note"
                        style={{background:'none',border:'none',color:'var(--teal)',cursor:'pointer',fontSize:'.85rem',padding:'4px 8px'}}>Edit</button>
                      <button onClick={() => {
                        if (window.confirm(`Delete note "${note.title}"?`)) onDelete('note', note.id)
                      }}
                        title="Delete note"
                        style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:'1rem',padding:'4px 8px'}}>✕</button>
                    </div>
                  </div>
                </div>
              ))
          }
        </section>
      )}

      {tab === 'tips' && (
        <section className="card">
          <p className="eyebrow">Time Management</p>
          <h3 style={{margin:'4px 0 14px'}}>20 Tips for Better Focus</h3>
          {[
            ['Stop multi-tasking','Focus on one thing at a time — task-switching costs more time than it saves.'],
            ['Set deadlines','Even self-imposed deadlines create urgency that drives completion.'],
            ['Prioritise tasks','Do the most important task first, before anything else.'],
            ['Remove distractions','Phone away, tabs closed. Your environment shapes your focus.'],
            ['Keep your mind fresh','Protect sleep, eat well, move daily. Energy is the foundation.'],
            ['Work when most productive','Know your peak hours and protect them for deep work.'],
            ["Set reminders","Don't rely on memory — systems beat willpower."],
            ['Turn off email alerts','Check email on a schedule, not whenever it arrives.'],
            ['Batch your tasks','Group similar tasks together to reduce mental switching costs.'],
            ['Brain dump your thoughts','Clear your head into a list first, then prioritise.'],
            ['Decline additional commitments','Every yes is a no to something else. Guard your calendar.'],
            ['Tidy your workspace','A clear desk reduces cognitive load before you start.'],
            ['Get more organised','Systems and structures make decisions automatic.'],
            ['Get in a routine','Consistent rhythms reduce daily decision fatigue.'],
            ['Manage your stress','Chronic stress kills focus and decision quality.'],
            ['Delegate tasks','If someone else can do it 80% as well — let them.'],
            ['Break big projects into steps','A project is just a series of small next actions.'],
            ['Only take on what you can finish','Overcommitment leads to underdelivery.'],
            ['Get inspired','Feed your mind with content that energises action.'],
            ['Only focus on what matters','Ask: if I could only do one thing today, what would it be?'],
          ].map(([tip, desc], i) => (
            <div key={i} style={{display:'flex',gap:12,padding:'10px 0',borderBottom:'1px solid var(--stone2)',alignItems:'flex-start'}}>
              <div style={{
                width:24,height:24,borderRadius:6,flexShrink:0,
                background:'var(--brass-dim)',color:'var(--brass-fg)',
                display:'grid',placeItems:'center',
                fontSize:'.72rem',fontWeight:700
              }}>{i+1}</div>
              <div>
                <div style={{fontWeight:700,fontSize:'.88rem',color:'var(--ink)',marginBottom:2}}>{tip}</div>
                <div style={{fontSize:'.78rem',color:'var(--muted)',lineHeight:1.5}}>{desc}</div>
              </div>
            </div>
          ))}
          <div style={{marginTop:10,padding:'12px 14px',background:'rgba(184,150,90,.08)',borderRadius:'var(--radius-sm)',fontSize:'.78rem',color:'var(--brass-fg)',lineHeight:1.6,fontStyle:'italic'}}>
            "The key is not to prioritize what's on your schedule, but to schedule your priorities." — Stephen Covey
          </div>
        </section>
      )}

      <TabNav tabs={TABS} activeTab={tab} onSelect={setTab} />
    </div>
  )
}

export { ProductivityPage }

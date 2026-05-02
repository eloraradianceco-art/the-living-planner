import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { usePlannerData } from '../context/PlannerContext.jsx'
import { getTodayString } from '../utils/dates.js'

function HealthWellnessPage() {
  // ── Shared ─────────────────────────────────────────────────────────────
  const lsGet = (k, d) => { try { const v = localStorage.getItem('planner.hw.' + k); return v ? JSON.parse(v) : d } catch { return d } }
  const lsSet = (k, v) => { try { localStorage.setItem('planner.hw.' + k, JSON.stringify(v)) } catch {} }

  // ── Wellness state ──────────────────────────────────────────────────────

  const [books, setBooks] = useState(() => lsGet('books', []))
  const [newBook, setNewBook] = useState({ title: '', author: '', status: 'Reading' })
  const [routine, setRoutine] = useState(() => lsGet('routine', []))
  const [newRoutineItem, setNewRoutineItem] = useState({ time: '', label: '', type: 'morning' })
  const [routineLog, setRoutineLog] = useState(() => lsGet('routineLog', {}))
  const [wellnessLog, setWellnessLog] = useState(() => lsGet('wellnessLog', {}))
  const [journalEntries, setJournalEntries] = useState(() => lsGet('journal', []))
  const [journalText, setJournalText] = useState('')
  const [journalPrompt, setJournalPrompt] = useState(0)

  const saveBooks = (b) => { setBooks(b); lsSet('books', b) }
  const saveRoutine = (r) => { setRoutine(r); lsSet('routine', r) }
  const saveLog = (l) => { setRoutineLog(l); lsSet('routineLog', l) }
  const saveWellness = (w) => { setWellnessLog(w); lsSet('wellnessLog', w) }
  const saveJournal = (j) => { setJournalEntries(j); lsSet('journal', j) }

  const todayKey = TODAY
  const todayLog = routineLog[todayKey] || []
  const todayWellness = wellnessLog[todayKey] || {}
  const toggleRoutineItem = (id) => {
    const next = todayLog.includes(id) ? todayLog.filter(x => x !== id) : [...todayLog, id]
    saveLog({ ...routineLog, [todayKey]: next })
  }
  const logWellness = (field, value) => saveWellness({ ...wellnessLog, [todayKey]: { ...todayWellness, [field]: value } })

  const MOOD_OPTIONS = [
    { emoji: '😄', label: 'Great', value: 5 },
    { emoji: '🙂', label: 'Good', value: 4 },
    { emoji: '😐', label: 'Okay', value: 3 },
    { emoji: '😔', label: 'Low', value: 2 },
    { emoji: '😩', label: 'Rough', value: 1 },
  ]
  const SLEEP_OPTIONS = ['< 5h', '5-6h', '6-7h', '7-8h', '8-9h', '9h+']
  const JOURNAL_PROMPTS = [
    'What am I grateful for today?',
    'What challenged me today and what did I learn?',
    'What would make today feel complete?',
    'Where did I see God at work today?',
    'What is one thing I want to let go of?',
    'What am I proud of this week?',
    'What does rest look like for me right now?',
    'What relationships need my attention?',
    'Where am I growing the most?',
    'What would I tell my future self about today?',
  ]

  const STATUS_COLORS = { Reading: 'var(--teal)', Completed: 'var(--success)', 'Want to Read': 'var(--brass)' }


  // ── Health state ────────────────────────────────────────────────────────
  const [tab, setTab] = useState('mood')
  
  

  // tab state above
  const [metricsLog, setMetricsLog] = useState(() => { try { const v = localStorage.getItem('planner.h.metrics'); return v ? JSON.parse(v) : [] } catch { return [] } })
  const [newMetric, setNewMetric] = useState({ weight: '', bp: '', heartRate: '', waist: '', notes: '' })
  const saveMetrics = (m) => { setMetricsLog(m); try { localStorage.setItem('planner.h.metrics', JSON.stringify(m)) } catch {} }
  const [meds, setMeds] = useState(() => lsGet('meds', []))
  const [medLog, setMedLog] = useState(() => lsGet('medLog', {}))
  const [anxiety, setAnxiety] = useState(() => lsGet('anxiety', []))
  const [migraines, setMigraines] = useState(() => lsGet('migraines', []))
  const [sleep, setSleep] = useState(() => lsGet('sleep', []))
  const [form, setForm] = useState({})

  const saveMeds = (m) => { setMeds(m); lsSet('meds', m) }
  const saveMedLog = (l) => { setMedLog(l); lsSet('medLog', l) }
  const saveAnxiety = (a) => { setAnxiety(a); lsSet('anxiety', a) }
  const saveMigraines = (m) => { setMigraines(m); lsSet('migraines', m) }
  const saveSleep = (s) => { setSleep(s); lsSet('sleep', s) }

  const todayMedKey = TODAY
  const todayMeds = medLog[todayMedKey] || []


  const COPING_SKILLS = {
    'Distractions': [
      'Clean or organize your environment','Dance','Doodle on paper','Draw','Garden',
      'Go for a drive','Go for a walk','Go shopping','Hug a stuffed animal',
      'Listen to music','Paint','Photography','Play a game','Play an instrument',
      'Put a puzzle together','Read','Sing','Take a break','Take a shower or a bath',
      'Watch funny videos','Watch a movie','Write'
    ],
    'Cognitive Coping': [
      'Act opposite of negative feelings','Brainstorm solutions','Make a gratitude list',
      'Read an inspirational quote','Reward yourself when successful','Slowly count to ten',
      'Take a class','Think about someone you love','Think of something funny',
      'Use positive self-talk','Visualize your favorite place','Write a list of goals',
      'Write a list of pros and cons','Write a list of strengths','Write a positive note'
    ],
    'Tension Releasers': [
      'Chew gum','Cry','Exercise or play sports','Laugh','Stretch','Use a stress ball'
    ]
  }

  const ANXIETY_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  const anxietyColor = (n) => n <= 3 ? 'var(--success)' : n <= 6 ? 'var(--warning)' : 'var(--danger)'


  const TABS = [
    {id:'mood',label:'😊 Mood'},{id:'sleep',label:'😴 Sleep'},
    {id:'journal',label:'✍ Journal'},{id:'routine',label:'🌅 Routine'},
    {id:'reading',label:'📚 Reading'},{id:'meds',label:'💊 Medications'},
    {id:'metrics',label:'📈 Body Metrics'},{id:'anxiety',label:'🧘 Anxiety'},
    {id:'migraines',label:'🤕 Migraines'},{id:'coping',label:'🛡 Coping Skills'},
  ]

  return (
    <div className="screen-stack">
      <div style={{display:'flex',alignItems:'center',gap:8,paddingBottom:2}}>
        <span style={{fontSize:'1.1rem'}}>🌿</span>
        <p style={{fontSize:'.62rem',fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',color:'var(--brass)',margin:0}}>Health & Wellness</p>
      </div>

      <div className="pill-row" style={{overflowX:'auto',flexWrap:'nowrap',paddingBottom:4}}>
        {TABS.map(t => (
          <button key={t.id} className={tab===t.id?'pill active-pill':'pill'}
            onClick={() => setTab(t.id)} style={{whiteSpace:'nowrap',fontSize:'.82rem'}}>{t.label}
          </button>
        ))}
      </div>

      {/* ── Mood ─────────────────────────────────────────────────── */}
      {tab === 'mood' && (
        <div>
          <section className="card">
            <p className="eyebrow">Daily Check-In</p>
            <h3 style={{margin:'4px 0 14px'}}>How are you feeling today?</h3>
            <div style={{display:'flex',gap:8,justifyContent:'space-between',marginBottom:16}}>
              {MOOD_OPTIONS.map(m => (
                <button key={m.value} onClick={() => logWellness('mood', m.value)} style={{
                  flex:1,padding:'10px 4px',borderRadius:'var(--radius-sm)',border:'2px solid',
                  cursor:'pointer',textAlign:'center',fontFamily:'var(--sans)',
                  borderColor: todayWellness.mood===m.value ? 'var(--brass)' : 'var(--border2)',
                  background: todayWellness.mood===m.value ? 'var(--brass-dim)' : 'transparent',
                  transition:'all .15s'
                }}>
                  <div style={{fontSize:'1.4rem',marginBottom:3}}>{m.emoji}</div>
                  <div style={{fontSize:'.62rem',fontWeight:600,color:todayWellness.mood===m.value?'var(--brass)':'var(--muted)'}}>{m.label}</div>
                </button>
              ))}
            </div>
            {todayWellness.mood && (
              <div style={{padding:'10px 12px',background:'var(--brass-dim)',borderRadius:'var(--radius-sm)',fontSize:'.82rem',color:'var(--brass2)',textAlign:'center'}}>
                {todayWellness.mood >= 4 ? '✦ Carry that energy forward today.' : todayWellness.mood >= 3 ? "✦ That's okay. One step at a time." : '✦ Reach out to someone. You matter.'}
              </div>
            )}
          </section>

          <section className="card">
            <p className="eyebrow">Energy Level</p>
            <h3 style={{margin:'4px 0 12px'}}>Rate your energy today</h3>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {[1,2,3,4,5,6,7,8,9,10].map(n => (
                <button key={n} onClick={() => logWellness('energy', n)} style={{
                  width:36,height:36,borderRadius:'var(--radius-sm)',border:'1.5px solid',cursor:'pointer',
                  fontWeight:700,fontSize:'.85rem',fontFamily:'var(--sans)',
                  borderColor: todayWellness.energy===n ? 'var(--brass)' : 'var(--border2)',
                  background: todayWellness.energy===n ? 'var(--brass)' : 'var(--stone)',
                  color: todayWellness.energy===n ? 'white' : 'var(--ink2)'
                }}>{n}</button>
              ))}
            </div>
          </section>

          <section className="card">
            <p className="eyebrow">Mood History</p>
            <h3 style={{margin:'4px 0 12px'}}>This Week</h3>
            <div style={{display:'flex',gap:6}}>
              {getWeekDays(TODAY).map(date => {
                const log = wellnessLog[date] || {}
                const mood = MOOD_OPTIONS.find(m => m.value === log.mood)
                return (
                  <div key={date} style={{flex:1,textAlign:'center'}}>
                    <div style={{fontSize:'1.1rem',marginBottom:3}}>{mood ? mood.emoji : '—'}</div>
                    <div style={{fontSize:'.6rem',color:'var(--muted)',fontWeight:600}}>{new Date(date+'T12:00:00').toLocaleDateString('en-US',{weekday:'narrow'})}</div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      )}

      {/* ── Sleep ────────────────────────────────────────────────── */}
      {/* ── Journal ──────────────────────────────────────────────── */}
      {tab === 'journal' && (
        <div>
          <section className="card">
            <p className="eyebrow">Reflection</p>
            <h3 style={{margin:'4px 0 10px'}}>Today's Entry</h3>
            <div style={{padding:'10px 12px',background:'var(--brass-dim)',borderRadius:'var(--radius-sm)',marginBottom:12,cursor:'pointer'}}
              onClick={() => setJournalPrompt((journalPrompt+1)%JOURNAL_PROMPTS.length)}>
              <div style={{fontSize:'.65rem',fontWeight:700,color:'var(--brass)',letterSpacing:'.08em',marginBottom:3}}>TODAY'S PROMPT — TAP TO CHANGE</div>
              <div style={{fontSize:'.88rem',color:'var(--ink)',fontStyle:'italic',fontFamily:'var(--serif)'}}>{JOURNAL_PROMPTS[journalPrompt]}</div>
            </div>
            <textarea value={journalText} onChange={e=>setJournalText(e.target.value)}
              placeholder="Write freely. This is your space."
              style={{width:'100%',minHeight:140,padding:'12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.9rem',fontFamily:'var(--serif)',color:'var(--ink)',background:'var(--stone)',resize:'none',lineHeight:1.7}} />
            <button className="primary-btn" style={{width:'100%',marginTop:10,fontSize:'.88rem'}}
              onClick={() => {
                if(!journalText.trim()) return
                const entry = {id:Date.now(),date:TODAY,text:journalText.trim(),prompt:JOURNAL_PROMPTS[journalPrompt]}
                const updated = [entry,...journalEntries]
                saveJournal(updated)
                setJournalText('')
              }}>Save Entry</button>
          </section>
          {journalEntries.slice(0,10).map(entry => (
            <section key={entry.id} className="card">
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                <div style={{fontSize:'.65rem',fontWeight:700,color:'var(--brass)',letterSpacing:'.08em'}}>{entry.date}</div>
                <button onClick={()=>saveJournal(journalEntries.filter(e=>e.id!==entry.id))}
                  style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:'.85rem'}}>✕</button>
              </div>
              {entry.prompt && <div style={{fontSize:'.75rem',color:'var(--muted)',fontStyle:'italic',marginBottom:6}}>{entry.prompt}</div>}
              <p style={{fontSize:'.88rem',color:'var(--ink2)',lineHeight:1.7,fontFamily:'var(--serif)',whiteSpace:'pre-wrap'}}>{entry.text}</p>
            </section>
          ))}
        </div>
      )}

      {/* ── Routine ──────────────────────────────────────────────── */}
      {tab === 'routine' && (
        <section className="card">
          <p className="eyebrow">Daily Routine Builder</p>
          <h3 style={{margin:'4px 0 14px'}}>Your Rhythm</h3>
          {routine.length === 0 && <p className="muted" style={{fontSize:'.85rem',marginBottom:12}}>Build your morning and evening rhythm below.</p>}
          {routine.map(item => {
            const done = todayLog.includes(item.id)
            return (
              <div key={item.id} onClick={() => toggleRoutineItem(item.id)} style={{
                display:'flex',alignItems:'center',gap:10,padding:'10px 0',
                borderBottom:'1px solid var(--stone2)',cursor:'pointer'
              }}>
                <div style={{width:22,height:22,borderRadius:6,border:'2px solid',flexShrink:0,
                  borderColor:done?'var(--success)':'var(--border2)',
                  background:done?'var(--success)':'var(--warm-white)',
                  display:'grid',placeItems:'center'}}>
                  {done && <span style={{color:'white',fontSize:'.72rem',fontWeight:800}}>✓</span>}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:'.9rem',fontWeight:500,color:done?'var(--muted)':'var(--ink)',textDecoration:done?'line-through':'none'}}>{item.label}</div>
                  <div style={{fontSize:'.72rem',color:'var(--muted)'}}>{item.time} · {item.type}</div>
                </div>
                <button onClick={e=>{e.stopPropagation();saveRoutine(routine.filter(r=>r.id!==item.id))}}
                  style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}}>✕</button>
              </div>
            )
          })}
          <div style={{display:'grid',gap:8,marginTop:12}}>
            <input placeholder="Routine item (e.g. Prayer, Workout, Read)" value={newRoutineItem.label}
              onChange={e=>setNewRoutineItem(p=>({...p,label:e.target.value}))}
              style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.88rem',background:'var(--stone)',color:'var(--text)'}} />
            <div style={{display:'flex',gap:8}}>
              <input placeholder="Time (6:00 AM)" value={newRoutineItem.time}
                onChange={e=>setNewRoutineItem(p=>({...p,time:e.target.value}))}
                style={{flex:1,padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem',background:'var(--stone)',color:'var(--text)'}} />
              <select value={newRoutineItem.type} onChange={e=>setNewRoutineItem(p=>({...p,type:e.target.value}))}
                style={{flex:1,padding:'9px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem',background:'var(--stone)',color:'var(--text)'}}>
                <option value="morning">Morning</option>
                <option value="evening">Evening</option>
                <option value="anytime">Anytime</option>
              </select>
            </div>
            <button className="primary-btn" onClick={() => {
              if(!newRoutineItem.label) return
              saveRoutine([...routine,{...newRoutineItem,id:Date.now()}])
              setNewRoutineItem({time:'',label:'',type:'morning'})
            }}>Add to Routine</button>
          </div>
        </section>
      )}

      {/* ── Reading ──────────────────────────────────────────────── */}
      {tab === 'reading' && (
        <section className="card">
          <div className="section-title-row">
            <div><p className="eyebrow">Reading Tracker</p><h3>Your Library</h3></div>
          </div>
          {books.map((book,i) => (
            <div key={i} style={{padding:'10px 0',borderBottom:'1px solid var(--stone2)'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:'.9rem',color:'var(--ink)'}}>{book.title}</div>
                  <div style={{fontSize:'.75rem',color:'var(--muted)',marginTop:2}}>{book.author}</div>
                </div>
                <div style={{display:'flex',gap:6,flexShrink:0,alignItems:'center'}}>
                  <span style={{fontSize:'.68rem',padding:'2px 8px',borderRadius:999,background:(STATUS_COLORS[book.status]||'var(--muted)')+'22',color:STATUS_COLORS[book.status]||'var(--muted)',fontWeight:700}}>{book.status}</span>
                  <button onClick={()=>saveBooks(books.filter((_,j)=>j!==i))} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}}>✕</button>
                </div>
              </div>
            </div>
          ))}
          {books.length === 0 && <p className="muted" style={{fontSize:'.85rem',marginBottom:12}}>No books yet. Add your first.</p>}
          <div style={{display:'grid',gap:8,marginTop:12}}>
            <input placeholder="Book title" value={newBook.title} onChange={e=>setNewBook(p=>({...p,title:e.target.value}))}
              style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.88rem',background:'var(--stone)',color:'var(--text)'}} />
            <div style={{display:'flex',gap:8}}>
              <input placeholder="Author" value={newBook.author} onChange={e=>setNewBook(p=>({...p,author:e.target.value}))}
                style={{flex:1,padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem',background:'var(--stone)',color:'var(--text)'}} />
              <select value={newBook.status} onChange={e=>setNewBook(p=>({...p,status:e.target.value}))}
                style={{flex:1,padding:'9px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem',background:'var(--stone)',color:'var(--text)'}}>
                <option>Reading</option><option>Want to Read</option><option>Completed</option>
              </select>
            </div>
            <button className="primary-btn" onClick={()=>{
              if(!newBook.title)return
              saveBooks([...books,{...newBook,id:Date.now()}])
              setNewBook({title:'',author:'',status:'Reading'})
            }}>Add Book</button>
          </div>
        </section>
      )}

      {tab === 'meds' && (
        <>
          <section className="card">
            <p className="eyebrow">Today's Medications</p>
            <h3 style={{ margin: '4px 0 14px' }}>Medication Log — {TODAY}</h3>
            {meds.map((med, i) => {
              const taken = todayMeds.includes(med.name)
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--surface)' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '.9rem', color: taken ? 'var(--muted)' : 'var(--text)', textDecoration: taken ? 'line-through' : 'none' }}>{med.name}</div>
                    <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>{med.dose} · {med.time} · {med.type}</div>
                  </div>
                  <button onClick={() => saveMedLog({ ...medLog, [todayMedKey]: taken ? todayMeds.filter(n => n !== med.name) : [...todayMeds, med.name] })}
                    style={{ padding: '6px 14px', borderRadius: 999, border: '1.5px solid', cursor: 'pointer', fontSize: '.82rem', fontWeight: 700, fontFamily: 'inherit',
                      borderColor: taken ? 'var(--success)' : 'var(--teal)',
                      background: taken ? 'rgba(34,197,94,.1)' : 'var(--teal)',
                      color: taken ? 'var(--success)' : 'var(--navy)' }}>
                    {taken ? '✓ Taken' : 'Take'}
                  </button>
                </div>
              )
            })}
            {meds.length === 0 && <p className="muted" style={{ fontSize: '.85rem' }}>No medications added yet.</p>}
          </section>
          <section className="card">
            <p className="eyebrow">Medication Summary</p>
            <h3 style={{ margin: '4px 0 12px' }}>Add Medication / Supplement</h3>
            <div style={{ display: 'grid', gap: 8 }}>
              {[['Name', 'medName', 'text', 'e.g. Vitamin D, Metformin'], ['Dose', 'medDose', 'text', 'e.g. 500mg'], ['Time', 'medTime', 'text', 'e.g. Morning, With food']].map(([lbl, key, type, ph]) => (
                <input key={key} type={type} placeholder={`${lbl} — ${ph}`} value={form[key] || ''} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                  style={{ padding: '9px 12px', border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', fontSize: '.85rem' }} />
              ))}
              <button className="primary-btn" onClick={() => {
                if(!form.medName) return
                saveMeds([...meds, {name:form.medName, dose:form.medDose||'', time:form.medTime||'', notes:form.medNotes||''}])
                setForm(p => ({...p, medName:'', medDose:'', medTime:'', medNotes:''}))
              }}>Add Medication</button>
            </div>
            {meds.length > 0 && (
              <div style={{ marginTop: 14 }}>
                {meds.map((med, i) => (
                  <div key={i} className="metric-row card-row">
                    <div>
                      <span style={{ fontWeight: 600, fontSize: '.88rem' }}>{med.name}</span>
                      <span style={{ fontSize: '.75rem', color: 'var(--muted)', marginLeft: 8 }}>{med.dose} · {med.time}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: '.72rem', padding: '2px 8px', borderRadius: 999, background: 'var(--teal-dim)', color: 'var(--teal)' }}>{med.type}</span>
                      <button onClick={() => saveMeds(meds.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {tab === 'sleep' && (
        <section className="card">
          <p className="eyebrow">Sleep Tracker</p>
          <h3 style={{ margin: '4px 0 12px' }}>Sleep Log</h3>
          <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={{ flex: 1, display: 'grid', gap: 4, fontSize: '.82rem', fontWeight: 600, color: 'var(--text2)' }}>
                Bedtime <input type="time" value={form.sleepBed || ''} onChange={e => setForm(p => ({ ...p, sleepBed: e.target.value }))}
                  style={{ padding: '9px 10px', border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)' }} />
              </label>
              <label style={{ flex: 1, display: 'grid', gap: 4, fontSize: '.82rem', fontWeight: 600, color: 'var(--text2)' }}>
                Wake time <input type="time" value={form.sleepWake || ''} onChange={e => setForm(p => ({ ...p, sleepWake: e.target.value }))}
                  style={{ padding: '9px 10px', border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)' }} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ flex: 1, display: 'grid', gap: 4, fontSize: '.82rem', fontWeight: 600, color: 'var(--text2)' }}>
                Quality (1-10)
                <input type="range" min={1} max={10} value={form.sleepQ || 5} onChange={e => setForm(p => ({ ...p, sleepQ: Number(e.target.value) }))}
                  style={{ accentColor: 'var(--teal)' }} />
              </label>
              <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--teal)', minWidth: 24 }}>{form.sleepQ || 5}</span>
            </div>
            <input placeholder="Notes (dreams, woke up, restless...)" value={form.sleepNote || ''} onChange={e => setForm(p => ({ ...p, sleepNote: e.target.value }))}
              style={{ padding: '9px 12px', border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', fontSize: '.85rem' }} />
            <button className="primary-btn" onClick={() => {
              const entry = { date: TODAY, bed: form.sleepBed, wake: form.sleepWake, quality: form.sleepQ || 5, notes: form.sleepNote }
              saveSleep([entry, ...sleep].slice(0, 30))
              setForm(p => ({ ...p, sleepBed: '', sleepWake: '', sleepQ: 5, sleepNote: '' }))
            }}>Log Sleep</button>
          </div>
          {sleep.slice(0, 7).map((entry, i) => (
            <div key={i} className="metric-row card-row">
              <div>
                <div style={{ fontWeight: 600, fontSize: '.88rem' }}>{entry.date}</div>
                <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>{entry.bed} → {entry.wake}{entry.notes ? ' · ' + entry.notes : ''}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: entry.quality >= 7 ? 'rgba(34,197,94,.15)' : entry.quality >= 5 ? 'rgba(240,180,41,.15)' : 'rgba(232,85,85,.15)', display: 'grid', placeItems: 'center' }}>
                  <span style={{ fontSize: '.82rem', fontWeight: 700, color: entry.quality >= 7 ? 'var(--success)' : entry.quality >= 5 ? 'var(--warning)' : 'var(--danger)' }}>{entry.quality}</span>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      {tab === 'anxiety' && (
        <section className="card">
          <p className="eyebrow">Anxiety Tracker</p>
          <h3 style={{ margin: '4px 0 12px' }}>Daily Check-In</h3>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: '.85rem', fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>How's your anxiety right now? (1 = calm, 10 = severe)</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {ANXIETY_LEVELS.map(n => (
                <button key={n} onClick={() => setForm(p => ({ ...p, anxLevel: n }))}
                  style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid', cursor: 'pointer', fontWeight: 700, fontSize: '.88rem', fontFamily: 'inherit',
                    borderColor: form.anxLevel === n ? anxietyColor(n) : 'var(--border2)',
                    background: form.anxLevel === n ? anxietyColor(n) + '18' : 'var(--surface)',
                    color: form.anxLevel === n ? anxietyColor(n) : 'var(--text2)' }}>{n}</button>
              ))}
            </div>
          </div>
          <input placeholder="Triggers or notes..." value={form.anxNote || ''} onChange={e => setForm(p => ({ ...p, anxNote: e.target.value }))}
            style={{ width: '100%', padding: '9px 12px', border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', fontSize: '.85rem', marginBottom: 10 }} />
          <button className="primary-btn" style={{ width: '100%' }} onClick={() => {
            if (!form.anxLevel) return
            saveAnxiety([{ date: TODAY, time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }), level: form.anxLevel, notes: form.anxNote }, ...anxiety].slice(0, 60))
            setForm(p => ({ ...p, anxLevel: null, anxNote: '' }))
          }}>Log Entry</button>
          <div style={{ marginTop: 14 }}>
            {anxiety.slice(0, 7).map((entry, i) => (
              <div key={i} className="metric-row card-row">
                <div>
                  <div style={{ fontSize: '.82rem', color: 'var(--muted)' }}>{entry.date} · {entry.time}</div>
                  {entry.notes && <div style={{ fontSize: '.8rem', color: 'var(--text2)' }}>{entry.notes}</div>}
                </div>
                <div style={{ width: 36, height: 36, borderRadius: '50%', display: 'grid', placeItems: 'center', background: anxietyColor(entry.level) + '18', flexShrink: 0 }}>
                  <span style={{ fontWeight: 700, color: anxietyColor(entry.level) }}>{entry.level}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === 'migraines' && (
        <section className="card">
          <p className="eyebrow">Migraine & Headache Tracker</p>
          <h3 style={{ margin: '4px 0 12px' }}>Log an Episode</h3>
          <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={{ flex: 1, display: 'grid', gap: 4, fontSize: '.82rem', fontWeight: 600, color: 'var(--text2)' }}>
                Type
                <select value={form.migType || 'Headache'} onChange={e => setForm(p => ({ ...p, migType: e.target.value }))}
                  style={{ padding: '9px 10px', border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', fontSize: '.85rem' }}>
                  <option>Headache</option><option>Migraine</option><option>Cluster</option><option>Tension</option>
                </select>
              </label>
              <label style={{ flex: 1, display: 'grid', gap: 4, fontSize: '.82rem', fontWeight: 600, color: 'var(--text2)' }}>
                Pain (1-10)
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="range" min={1} max={10} value={form.migPain || 5} onChange={e => setForm(p => ({ ...p, migPain: Number(e.target.value) }))}
                    style={{ flex: 1, accentColor: 'var(--danger)' }} />
                  <span style={{ fontWeight: 700, color: 'var(--danger)', minWidth: 16 }}>{form.migPain || 5}</span>
                </div>
              </label>
            </div>
            <input placeholder="Duration (e.g. 2 hours, all day)" value={form.migDur || ''} onChange={e => setForm(p => ({ ...p, migDur: e.target.value }))}
              style={{ padding: '9px 12px', border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', fontSize: '.85rem' }} />
            <input placeholder="Triggers (stress, sleep, food, weather...)" value={form.migTrig || ''} onChange={e => setForm(p => ({ ...p, migTrig: e.target.value }))}
              style={{ padding: '9px 12px', border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', fontSize: '.85rem' }} />
            <input placeholder="Medication taken" value={form.migMed || ''} onChange={e => setForm(p => ({ ...p, migMed: e.target.value }))}
              style={{ padding: '9px 12px', border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', fontSize: '.85rem' }} />
            <button className="primary-btn" onClick={() => {
              saveMigraines([{ date: TODAY, type: form.migType || 'Headache', pain: form.migPain || 5, duration: form.migDur, triggers: form.migTrig, medication: form.migMed }, ...migraines].slice(0, 60))
              setForm(p => ({ ...p, migType: 'Headache', migPain: 5, migDur: '', migTrig: '', migMed: '' }))
            }}>Log Episode</button>
          </div>
          <div style={{ fontSize: '.82rem', color: 'var(--muted)', marginBottom: 8 }}>Last 30 days: {migraines.filter(m => m.date >= addDays(TODAY, -30)).length} episodes</div>
          {migraines.slice(0, 7).map((entry, i) => (
            <div key={i} className="metric-row card-row" style={{ alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '.88rem' }}>{entry.date} · {entry.type}</div>
                <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>
                  {entry.duration && `${entry.duration} · `}{entry.triggers && `Triggers: ${entry.triggers}`}
                  {entry.medication && ` · ${entry.medication}`}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(232,85,85,.12)', display: 'grid', placeItems: 'center' }}>
                  <span style={{ fontWeight: 700, color: 'var(--danger)', fontSize: '.82rem' }}>{entry.pain}</span>
                </div>
                <button onClick={() => saveMigraines(migraines.filter((_, j) => j !== i))}
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>✕</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {tab === 'coping' && (
        <section className="card">
          <p className="eyebrow">Coping Skills</p>
          <h3 style={{margin:'4px 0 12px'}}>Your Toolkit</h3>
          {Object.entries(COPING_SKILLS).map(([category, skills]) => (
            <div key={category} style={{marginBottom:18}}>
              <div style={{fontSize:'.7rem', fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', color:'var(--brass)', marginBottom:8}}>{category}</div>
              <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
                {skills.map(skill => (
                  <span key={skill} style={{
                    padding:'6px 12px', borderRadius:999,
                    border:'1.5px solid var(--border2)',
                    background:'var(--stone)', color:'var(--ink2)',
                    fontSize:'.78rem', fontWeight:500,
                    display:'inline-block'
                  }}>{skill}</span>
                ))}
              </div>
            </div>
          ))}
          <div style={{marginTop:8, padding:'10px 12px', background:'var(--teal-dim)', borderRadius:'var(--radius-sm)', fontSize:'.78rem', color:'var(--text2)', lineHeight:1.6}}>
            💡 These are tools — use what works for you in the moment.
          </div>
        </section>
      )}

      {tab === 'metrics' && (
        <div>
          <section className="card">
            <p className="eyebrow">Body Metrics</p>
            <h3 style={{margin:'4px 0 6px'}}>Log Today</h3>
            <div style={{display:'grid',gap:10,marginBottom:14}}>
              {[
                {key:'weight',label:'Weight (lbs)',placeholder:'185'},
                {key:'bp',label:'Blood Pressure',placeholder:'120/80'},
                {key:'heartRate',label:'Resting Heart Rate (bpm)',placeholder:'68'},
                {key:'waist',label:'Waist (inches)',placeholder:'32'},
              ].map(f => (
                <div key={f.key}>
                  <label style={{fontSize:'.8rem',fontWeight:600,color:'var(--text2)',marginBottom:4,display:'block'}}>{f.label}</label>
                  <input value={newMetric[f.key]} onChange={e=>setNewMetric(p=>({...p,[f.key]:e.target.value}))}
                    placeholder={f.placeholder}
                    style={{width:'100%',padding:'10px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.9rem',background:'var(--stone)',color:'var(--text)'}} />
                </div>
              ))}
              <div>
                <label style={{fontSize:'.8rem',fontWeight:600,color:'var(--text2)',marginBottom:4,display:'block'}}>Notes</label>
                <input value={newMetric.notes} onChange={e=>setNewMetric(p=>({...p,notes:e.target.value}))}
                  placeholder="How I feel, context..."
                  style={{width:'100%',padding:'10px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.9rem',background:'var(--stone)',color:'var(--text)'}} />
              </div>
              <button className="primary-btn" onClick={() => {
                const hasData = newMetric.weight || newMetric.bp || newMetric.heartRate || newMetric.waist
                if (!hasData) return
                const entry = { ...newMetric, date: TODAY, id: Date.now() }
                saveMetrics([entry, ...metricsLog])
                setNewMetric({ weight: '', bp: '', heartRate: '', waist: '', notes: '' })
              }}>Log Entry</button>
            </div>
          </section>
          {metricsLog.length > 0 && (
            <section className="card">
              <p className="eyebrow">History</p>
              <h3 style={{margin:'4px 0 12px'}}>Recent Entries</h3>
              {metricsLog.slice(0,10).map(entry => (
                <div key={entry.id} style={{padding:'10px 0',borderBottom:'1px solid var(--stone2)'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                    <div style={{fontSize:'.75rem',fontWeight:700,color:'var(--brass)'}}>{entry.date}</div>
                    <button onClick={()=>saveMetrics(metricsLog.filter(m=>m.id!==entry.id))} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:'.85rem'}}>✕</button>
                  </div>
                  <div style={{display:'flex',gap:12,flexWrap:'wrap',fontSize:'.82rem',color:'var(--ink2)'}}>
                    {entry.weight && <span>⚖ {entry.weight} lbs</span>}
                    {entry.bp && <span>💓 {entry.bp}</span>}
                    {entry.heartRate && <span>❤ {entry.heartRate} bpm</span>}
                    {entry.waist && <span>📏 {entry.waist}"</span>}
                  </div>
                  {entry.notes && <div style={{fontSize:'.78rem',color:'var(--muted)',marginTop:4,fontStyle:'italic'}}>{entry.notes}</div>}
                </div>
              ))}
            </section>
          )}
        </div>
      )}

    </div>
  )
}






export default HealthWellnessPage

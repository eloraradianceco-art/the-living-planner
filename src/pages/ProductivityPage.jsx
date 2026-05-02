import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { usePlannerData } from '../context/PlannerContext.jsx'
import { getTodayString } from '../utils/dates.js'

function ProductivityPage({ tasks, onQuickCreate, onToggle, onEdit, onDelete, settings }) {
  const lsGet = (k, d) => { try { const v = localStorage.getItem('planner.p.' + k); return v ? JSON.parse(v) : d } catch { return d } }
  const lsSet = (k, v) => { try { localStorage.setItem('planner.p.' + k, JSON.stringify(v)) } catch {} }

  const [tab, setTab] = useState('tasks')
  const [noteQuery, setNoteQuery] = useState('')
  const [notes, setNotes] = useState(() => { try { const v = localStorage.getItem('planner.notes'); return v ? JSON.parse(v) : [] } catch { return [] } })
  const saveNotes = (n) => { setNotes(n); try { localStorage.setItem('planner.notes', JSON.stringify(n)) } catch {} }
  const [checklists, setChecklists] = useState(() => lsGet('checklists', [{ id: 1, title: 'Work Checklist', items: [] }]))
  const [cleaningLog, saveCleaningLogDirect] = useState(() => lsGet('cleaning_log_v2', {}))
  const saveCleaningLog2 = (updated) => { saveCleaningLogDirect(updated); lsSet('cleaning_log_v2', updated) }
  const [cleaningFreq, setCleaningFreq] = useState('daily')
  const [brainDump, setBrainDump] = useState(() => { try { return localStorage.getItem('planner.p.braindump')||'' } catch { return '' } })
  const saveBrainDump = (v) => { setBrainDump(v); try { localStorage.setItem('planner.p.braindump', v) } catch {} }
  const [focusMinutes, setFocusMinutes] = useState(25)
  const [focusSeconds, setFocusSecondsState] = useState(0)
  const [focusRunning, setFocusRunning] = useState(false)
  const [focusMode, setFocusMode] = useState('work') // work | break
  const [focusSessions, setFocusSessions] = useState(0)
  const focusRef = React.useRef(null)
  React.useEffect(() => {
    if (focusRunning) {
      focusRef.current = setInterval(() => {
        setFocusSecondsState(prev => {
          if (prev > 0) return prev - 1
          setFocusRunning(false)
          if (focusMode === 'work') {
            setFocusSessions(s => s + 1)
            setFocusMode('break')
            setFocusMinutes(5)
            return 0
          } else {
            setFocusMode('work')
            setFocusMinutes(25)
            return 0
          }
        })
      }, 1000)
    } else {
      clearInterval(focusRef.current)
    }
    return () => clearInterval(focusRef.current)
  }, [focusRunning, focusMode])
  const focusTotal = focusMinutes * 60 + focusSeconds
  const focusDisplay = `${String(focusMinutes).padStart(2,'0')}:${String(focusSeconds).padStart(2,'0')}`

  const CLEANING_SCHEDULE = {
    daily: [
      'Make beds', 'Do laundry', 'Take out trash', 'Load/unload dishwasher',
      'Clean countertops', 'Pick up & tidy shared spaces', 'Wipe down sinks & toilets', 'Spot vacuuming'
    ],
    weekly: [
      'Sweep/Vacuum/Mop all floors', 'Wash bedding', 'Clean mirrors', 'Dust & polish furniture',
      'Sweep/Mop kitchen', 'Clean stovetop', 'Wipe down kitchen appliances', 'Clean microwave',
      'Wipe down kitchen cabinets', 'Wash dish towels', 'Clean bathroom sinks & faucets',
      'Scrub toilets', 'Clean shower doors', 'Vacuum rugs & upholstery',
      'Clean windows & blinds', 'Empty all trash cans', 'Straighten closets & drawers',
      'Vacuum & sweep stairs', 'Clean handrails', 'Wipe down washer & dryer exterior'
    ],
    monthly: [
      'Clean out fridge & freezer', 'Purge & tidy pantry', 'Wash bath mats & shower curtains',
      'Wipe down all cabinet fronts', 'Clean doors & walls', 'Dust ceiling fans & light fixtures',
      'Clean baseboards', 'Organize junk drawer', 'Deep clean shower head',
      'Restock toiletries', 'Purge & organize bathroom cabinets', 'Clean dryer lint trap thoroughly',
      'Flip sofa cushions & pillows', 'Wash blankets', 'Clean under couch',
      'Purge & organize toys or office supplies', 'Replenish cleaning supplies'
    ],
    quarterly: [
      'Clean/wash windows inside & out', 'Purge closets & clutter', 'Flip mattresses',
      'Deep clean oven', 'Deep clean fridge/freezer interior', 'Organize inside cabinets',
      'Replace sink sponges', 'Deep clean trash cans', 'Wash comforters & duvets',
      'Vacuum heating & cooling vents', 'Scrub tile grout', 'Air out rooms & drapes',
      'Sort and clean closets — donate items', 'Clean & check pantry for expired items',
      'Wipe switches, door handles & frames'
    ],
    yearly: [
      'Clean carpets professionally', 'Dust refrigerator vent', 'Give AC a tune-up',
      'Wash walls', 'Rinse window screens', 'Wash windowsills', 'Take off and scrub blinds',
      'Deep clean dishwasher & freezer', 'Polish wood cabinets', 'Clean fireplace',
      'Clean dryer vent hose', 'Clean washer gasket', 'Purge & organize laundry supplies',
      'Wash light fixtures', 'Clean dryer vent'
    ]
  }
  const FREQ_LABELS = { daily:'Daily', weekly:'Weekly', monthly:'Monthly', quarterly:'Quarterly', yearly:'Yearly' }
  const FREQ_KEY_PREFIX = { daily:'d', weekly:'w', monthly:'m', quarterly:'q', yearly:'y' }
  const [newChecklist, setNewChecklist] = useState('')
  const [newItem, setNewItem] = useState({})

  const saveChecklists = (c) => { setChecklists(c); lsSet('checklists', c) }


  return (
    <div className="screen-stack">
      <div style={{display:"flex",alignItems:"center",gap:8,paddingBottom:2}}>
        <span style={{fontSize:"1.1rem"}}>⚡</span>
        <p style={{fontSize:".62rem",fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:"var(--brass)",margin:0}}>Productivity</p>
      </div>
      <div className="pill-row" style={{ overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 4 }}>
        {[{ id: 'tasks', label: '✓ Tasks' }, { id: 'braindump', label: '🧠 Brain Dump' }, { id: 'notes', label: '📝 Notes' }, { id: 'checklists', label: '📋 Checklists' }, { id: 'focus', label: '⏱ Focus Timer' }, { id: 'cleaning', label: '🧹 Cleaning' }, { id: 'tips', label: '💡 Time Tips' }].map(t => (
          <button key={t.id} className={tab === t.id ? 'pill active-pill' : 'pill'}
            onClick={() => setTab(t.id)} style={{ whiteSpace: 'nowrap', fontSize: '.82rem' }}>{t.label}</button>
        ))}
      </div>

      {tab === 'tasks' && (
        <section className="card">
          <div className="section-title-row">
            <div><p className="eyebrow">Productivity</p><h3>Tasks</h3></div>
            <button className="primary-btn" style={{ fontSize: '.82rem', padding: '8px 14px' }} onClick={() => onQuickCreate('task')}>+ Task</button>
          </div>
          {tasks.filter(t => !t.completed || settings.showCompletedTasks).slice(0, 20).map(task => (
            <div key={task.id} className="metric-row card-row" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '.9rem', textDecoration: task.completed ? 'line-through' : 'none', color: task.completed ? 'var(--muted)' : 'var(--text)' }}>{task.title}</div>
                <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>{task.category} • {task.date}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button className={task.completed ? 'secondary-btn' : 'primary-btn'} style={{ fontSize: '.78rem', padding: '5px 10px' }} onClick={() => onToggle(task.id)}>{task.completed ? '✓ Done' : 'Complete'}</button>
                <button className="ghost-btn" style={{ fontSize: '.78rem', padding: '5px 10px' }} onClick={() => onEdit('task', task)}>Edit</button>
              </div>
            </div>
          ))}
        </section>
      )}

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
            <button onClick={()=>saveBrainDump('')} style={{background:'none',border:'1px solid var(--border)',borderRadius:6,padding:'4px 10px',fontSize:'.75rem',color:'var(--muted)',cursor:'pointer'}}>Clear</button>
          </div>
        </section>
      )}

      {tab === 'focus' && (
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
              boxShadow:`0 0 0 6px ${focusMode==='work' ? 'var(--ink)' : 'var(--success)'}22`
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
              <button onClick={()=>setFocusRunning(r=>!r)} style={{
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
                <button key={label} onClick={()=>{setFocusRunning(false);setFocusMode(mode);setFocusMinutes(mins);setFocusTimeLeft(focusCustomMins * 60)}}
                  style={{padding:'6px 12px',borderRadius:999,fontSize:'.78rem',cursor:'pointer',
                  border:'1.5px solid var(--border2)',background:'var(--stone)',color:'var(--ink)',fontWeight:500}}>{label} · {mins}m</button>
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
                <span style={{color:'var(--brass)',fontWeight:700}}>{i+1}.</span>{tip}
              </div>
            ))}
          </div>
        </section>
      )}


      {tab === 'checklists' && (
        <>
          {checklists.map((cl, ci) => (
            <section key={cl.id} className="card">
              <div className="section-title-row">
                <h3 style={{ fontSize: '1rem' }}>{cl.title}</h3>
                <button onClick={() => saveChecklists(checklists.filter((_, i) => i !== ci))}
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '.85rem' }}>Remove</button>
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
      )}

      {tab === 'cleaning' && (
        <div>
          <section className="card" style={{padding:'12px 14px'}}>
            <p className="eyebrow">Home Cleaning Tracker</p>
            <h3 style={{margin:'4px 0 10px'}}>Keeping a Clean Home</h3>
            <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
              {Object.keys(CLEANING_SCHEDULE).map(freq => {
                const tasks = CLEANING_SCHEDULE[freq]
                const prefix = FREQ_KEY_PREFIX[freq]
                const done = tasks.filter(t => cleaningLog[prefix+'_'+t])
                return (
                  <button key={freq} onClick={() => setCleaningFreq(freq)} style={{
                    padding:'6px 12px',borderRadius:999,border:'1.5px solid',fontSize:'.78rem',
                    cursor:'pointer',fontFamily:'var(--sans)',fontWeight:600,
                    borderColor: cleaningFreq===freq ? 'var(--brass)' : 'var(--border2)',
                    background: cleaningFreq===freq ? 'var(--brass-dim)' : 'transparent',
                    color: cleaningFreq===freq ? 'var(--brass)' : 'var(--muted)',
                    position:'relative'
                  }}>
                    {FREQ_LABELS[freq]}
                    {done.length > 0 && (
                      <span style={{marginLeft:4,fontSize:'.65rem',color:cleaningFreq===freq?'var(--brass)':'var(--success)',fontWeight:700}}>
                        {done.length + '/' + tasks.length}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </section>

          <section className="card">
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <div>
                <p className="eyebrow">{FREQ_LABELS[cleaningFreq]}</p>
                <h3 style={{margin:'2px 0 0'}}>
                  {CLEANING_SCHEDULE[cleaningFreq].filter(t => cleaningLog[FREQ_KEY_PREFIX[cleaningFreq]+'_'+t]).length} of {CLEANING_SCHEDULE[cleaningFreq].length} done
                </h3>
              </div>
              <button onClick={() => {
                const prefix = FREQ_KEY_PREFIX[cleaningFreq]
                const tasks = CLEANING_SCHEDULE[cleaningFreq]
                const allDone = tasks.every(t => cleaningLog[prefix+'_'+t])
                const updated = {...cleaningLog}
                tasks.forEach(t => { allDone ? delete updated[prefix+'_'+t] : (updated[prefix+'_'+t] = true) })
                saveCleaningLog2(updated)
              }} className="ghost-btn" style={{fontSize:'.75rem',padding:'5px 10px'}}>
                {CLEANING_SCHEDULE[cleaningFreq].every(t => cleaningLog[FREQ_KEY_PREFIX[cleaningFreq]+'_'+t]) ? 'Uncheck All' : 'Check All'}
              </button>
            </div>

            {CLEANING_SCHEDULE[cleaningFreq].map(task => {
              const key = FREQ_KEY_PREFIX[cleaningFreq] + '_' + task
              const done = !!cleaningLog[key]
              return (
                <div key={task} onClick={() => {
                  const updated = {...cleaningLog}
                  done ? delete updated[key] : (updated[key] = true)
                  saveCleaningLog2(updated)
                }} style={{
                  display:'flex',alignItems:'center',gap:10,padding:'10px 0',
                  borderBottom:'1px solid var(--stone2)',cursor:'pointer'
                }}>
                  <div style={{
                    width:22,height:22,borderRadius:6,border:'2px solid',flexShrink:0,
                    borderColor: done ? 'var(--success)' : 'var(--border2)',
                    background: done ? 'var(--success)' : 'var(--warm-white)',
                    display:'grid',placeItems:'center',transition:'all .15s'
                  }}>
                    {done && <span style={{color:'white',fontSize:'.72rem',fontWeight:800}}>✓</span>}
                  </div>
                  <span style={{
                    fontSize:'.88rem',flex:1,
                    color: done ? 'var(--muted)' : 'var(--ink)',
                    textDecoration: done ? 'line-through' : 'none',
                    transition:'all .15s'
                  }}>{task}</span>
                </div>
              )
            })}

            {CLEANING_SCHEDULE[cleaningFreq].filter(t => cleaningLog[FREQ_KEY_PREFIX[cleaningFreq]+'_'+t]).length === CLEANING_SCHEDULE[cleaningFreq].length && (
              <div style={{marginTop:12,padding:'10px 14px',background:'rgba(52,168,83,.08)',borderRadius:'var(--radius-sm)',textAlign:'center',fontSize:'.85rem',color:'var(--success)',fontWeight:600}}>
                ✓ All {FREQ_LABELS[cleaningFreq].toLowerCase()} tasks complete!
              </div>
            )}
          </section>
        </div>
      )}

      {tab === 'notes' && (
        <section className="card">
          <div className="section-title-row">
            <div><p className="eyebrow">Notes</p><h3>Quick Capture</h3></div>
            <button className="primary-btn" style={{fontSize:'.8rem',padding:'6px 12px'}} onClick={() => {
              const title = prompt('Note title:')
              if(!title) return
              const content = prompt('Note content:')
              const newNote = {id:Date.now(),title,content:content||'',date:TODAY}
              const updated = [newNote, ...notes]
              setNotes(updated)
              try{localStorage.setItem('planner.notes',JSON.stringify(updated))}catch{}
            }}>+ Note</button>
          </div>
          <input placeholder="Search notes..." value={noteQuery} onChange={e=>setNoteQuery(e.target.value)}
            style={{width:'100%',padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem',marginBottom:12,background:'var(--stone)',color:'var(--text)'}} />
          {notes.filter(n => !noteQuery || n.title.toLowerCase().includes(noteQuery.toLowerCase()) || (n.content||'').toLowerCase().includes(noteQuery.toLowerCase())).length === 0
            ? <p className="muted" style={{fontSize:'.85rem'}}>No notes yet. Capture your first thought.</p>
            : notes.filter(n => !noteQuery || n.title.toLowerCase().includes(noteQuery.toLowerCase()) || (n.content||'').toLowerCase().includes(noteQuery.toLowerCase())).map(note => (
            <div key={note.id} style={{padding:'10px 0',borderBottom:'1px solid var(--stone2)'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:4}}>
                <strong style={{fontSize:'.9rem',color:'var(--ink)'}}>{note.title}</strong>
                <div style={{display:'flex',gap:6,flexShrink:0}}>
                  <span style={{fontSize:'.72rem',color:'var(--muted)'}}>{note.date}</span>
                  <button style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:'.9rem'}} onClick={()=>{
                    const updated = notes.filter(n=>n.id!==note.id)
                    setNotes(updated)
                    try{localStorage.setItem('planner.notes',JSON.stringify(updated))}catch{}
                  }}>✕</button>
                </div>
              </div>
              <p style={{fontSize:'.82rem',color:'var(--text2)',lineHeight:1.5}}>{note.content}</p>
            </div>
          ))}
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
                background:'var(--brass-dim)',color:'var(--brass)',
                display:'grid',placeItems:'center',
                fontSize:'.72rem',fontWeight:700
              }}>{i+1}</div>
              <div>
                <div style={{fontWeight:700,fontSize:'.88rem',color:'var(--ink)',marginBottom:2}}>{tip}</div>
                <div style={{fontSize:'.78rem',color:'var(--muted)',lineHeight:1.5}}>{desc}</div>
              </div>
            </div>
          ))}
          <div style={{marginTop:10,padding:'12px 14px',background:'rgba(184,150,90,.08)',borderRadius:'var(--radius-sm)',fontSize:'.78rem',color:'var(--brass2)',lineHeight:1.6,fontStyle:'italic'}}>
            "The key is not to prioritize what's on your schedule, but to schedule your priorities." — Stephen Covey
          </div>
        </section>
      )}

    </div>
  )
}

// ── LIFESTYLE PAGE ─────────────────────────────────────────────────────────
function WorkoutTrackerTab() {
  const lsG = (k,d) => { try{const v=localStorage.getItem('planner.l.'+k);return v?JSON.parse(v):d}catch{return d} }
  const lsS = (k,v) => { try{localStorage.setItem('planner.l.'+k,JSON.stringify(v))}catch{} }
  const [wLogs, setWLogs] = useState(()=>lsG('workouts',[]))
  const [wForm, setWForm] = useState({type:'Strength',duration:'',notes:'',date:new Date().toISOString().slice(0,10)})
  const saveWLogs = (v) => { setWLogs(v); lsS('workouts',v) }
  const TYPES = ['Strength','Cardio','HIIT','Yoga','Pilates','Cycling','Running','Swimming','Walking','Sports','Other']
  const today = new Date().toISOString().slice(0,10)
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay())
  const weekStartStr = weekStart.toISOString().slice(0,10)
  const thisWeekLogs = wLogs.filter(l => l.date >= weekStartStr && l.date <= today)
  const totalMins = thisWeekLogs.reduce((s,l)=>s+Number(l.duration||0),0)

  return (
    <section className="card">
      <p className="eyebrow">Workout Tracker</p>
      <h3 style={{margin:'4px 0 14px'}}>Log Your Training</h3>

      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:16}}>
        {[
          ['This Week',thisWeekLogs.length+' sessions','var(--teal)'],
          ['Minutes',totalMins+' min','var(--brass)'],
          ['Total',wLogs.length+' logged','var(--success)'],
        ].map(([l,v,c])=>(
          <div key={l} style={{background:'var(--stone)',borderRadius:10,padding:'10px',textAlign:'center'}}>
            <div className="muted" style={{fontSize:'.7rem',marginBottom:3}}>{l}</div>
            <strong style={{color:c,fontSize:'.9rem'}}>{v}</strong>
          </div>
        ))}
      </div>

      <div style={{display:'grid',gap:8,marginBottom:16,padding:'14px',background:'var(--stone)',borderRadius:10}}>
        <p style={{fontWeight:600,fontSize:'.85rem',margin:0}}>Log a Workout</p>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <select value={wForm.type} onChange={e=>setWForm(p=>({...p,type:e.target.value}))}
            style={{padding:'9px 10px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}}>
            {TYPES.map(t=><option key={t}>{t}</option>)}
          </select>
          <input type="number" placeholder="Duration (min)" value={wForm.duration}
            onChange={e=>setWForm(p=>({...p,duration:e.target.value}))}
            style={{padding:'9px 10px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}} />
        </div>
        <input type="date" value={wForm.date} onChange={e=>setWForm(p=>({...p,date:e.target.value}))}
          style={{padding:'9px 10px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}} />
        <input placeholder="Notes (e.g. PRs, how you felt)" value={wForm.notes}
          onChange={e=>setWForm(p=>({...p,notes:e.target.value}))}
          style={{padding:'9px 10px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}} />
        <button className="primary-btn" onClick={()=>{
          if(!wForm.duration) return
          saveWLogs([{...wForm,id:Date.now()},...wLogs])
          setWForm({type:'Strength',duration:'',notes:'',date:today})
        }}>+ Log Workout</button>
      </div>

      {wLogs.length === 0 && <p className="muted" style={{textAlign:'center',padding:'12px 0'}}>No workouts logged yet.</p>}
      {wLogs.slice(0,15).map((log,i)=>(
        <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
          <div>
            <div style={{fontWeight:600,fontSize:'.88rem'}}>{log.type}</div>
            <div className="muted" style={{fontSize:'.75rem'}}>{log.date} · {log.duration} min{log.notes?' · '+log.notes:''}</div>
          </div>
          <button onClick={()=>saveWLogs(wLogs.filter((_,j)=>j!==i))}
            style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:'1.1rem'}}>✕</button>
        </div>
      ))}
    </section>
  )
}

function PeriodTrackerTab() {
  const lsG = (k,d) => { try{const v=localStorage.getItem('planner.l.'+k);return v?JSON.parse(v):d}catch{return d} }
  const lsS = (k,v) => { try{localStorage.setItem('planner.l.'+k,JSON.stringify(v))}catch{} }
  const today = new Date().toISOString().slice(0,10)
  const [cycles, setCycles] = useState(()=>lsG('cycles',[]))
  const [cycleLen, setCycleLen] = useState(()=>lsG('cycleLen',28))
  const [periodLen, setPeriodLen] = useState(()=>lsG('periodLen',5))
  const [lastStart, setLastStart] = useState(()=>lsG('lastPeriodStart',''))
  const [symptoms, setSymptoms] = useState(()=>lsG('symptoms',{}))
  const [logDate, setLogDate] = useState(today)
  const [cycleStart, setCycleStart] = useState('')
  const [cycleEnd, setCycleEnd] = useState('')
  const saveCycles = (v) => { setCycles(v); lsS('cycles',v) }

  const nextStart = lastStart ? (() => {
    const d = new Date(lastStart); d.setDate(d.getDate() + Number(cycleLen))
    return d.toISOString().slice(0,10)
  })() : null
  const ovulationDay = lastStart ? (() => {
    const d = new Date(lastStart); d.setDate(d.getDate() + Number(cycleLen) - 14)
    return d.toISOString().slice(0,10)
  })() : null
  const daysUntilNext = nextStart ? Math.ceil((new Date(nextStart) - new Date(today)) / 86400000) : null
  const currentPhase = lastStart ? (() => {
    const daysSince = Math.ceil((new Date(today) - new Date(lastStart)) / 86400000)
    if (daysSince <= periodLen) return {phase:'Menstrual',color:'#E85555',desc:'Rest, hydrate, use heat therapy. Iron-rich foods help.'}
    if (daysSince <= 13) return {phase:'Follicular',color:'#FF9800',desc:'Energy rising. Great time for new projects and harder workouts.'}
    if (daysSince <= 16) return {phase:'Ovulatory',color:'#4CAF50',desc:'Peak energy and confidence. Best time for big decisions and social events.'}
    return {phase:'Luteal',color:'#9C27B0',desc:'Wind down. Prioritize sleep, reduce stress, gentler exercise.'}
  })() : null

  const SYMPTOM_OPTIONS = ['Cramps','Bloating','Headache','Fatigue','Mood swings','Acne','Back pain','Cravings','Tender breasts','Nausea']

  return (
    <section className="card">
      <p className="eyebrow">Period Tracker</p>
      <h3 style={{margin:'4px 0 14px'}}>Cycle Awareness</h3>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16}}>
        <div style={{background:'var(--stone)',borderRadius:10,padding:'12px'}}>
          <p className="muted" style={{fontSize:'.72rem',margin:'0 0 6px'}}>Cycle Length (days)</p>
          <input type="number" value={cycleLen} onChange={e=>{setCycleLen(Number(e.target.value));lsS('cycleLen',Number(e.target.value))}}
            style={{width:'100%',padding:'7px 10px',border:'1.5px solid var(--border2)',borderRadius:6,fontSize:'1rem',fontWeight:700,boxSizing:'border-box'}} />
        </div>
        <div style={{background:'var(--stone)',borderRadius:10,padding:'12px'}}>
          <p className="muted" style={{fontSize:'.72rem',margin:'0 0 6px'}}>Period Length (days)</p>
          <input type="number" value={periodLen} onChange={e=>{setPeriodLen(Number(e.target.value));lsS('periodLen',Number(e.target.value))}}
            style={{width:'100%',padding:'7px 10px',border:'1.5px solid var(--border2)',borderRadius:6,fontSize:'1rem',fontWeight:700,boxSizing:'border-box'}} />
        </div>
      </div>

      <div style={{marginBottom:16}}>
        <p style={{fontWeight:600,fontSize:'.85rem',marginBottom:6}}>Last Period Start Date</p>
        <input type="date" value={lastStart} onChange={e=>{setLastStart(e.target.value);lsS('lastPeriodStart',e.target.value)}}
          style={{width:'100%',padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem',boxSizing:'border-box'}} />
      </div>

      {currentPhase && (
        <div style={{background:currentPhase.color+'18',border:`1.5px solid ${currentPhase.color}44`,borderRadius:12,padding:'14px',marginBottom:16}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
            <strong style={{color:currentPhase.color,fontSize:'1rem'}}>{currentPhase.phase} Phase</strong>
            {daysUntilNext !== null && (
              <span className="muted" style={{fontSize:'.78rem'}}>
                {daysUntilNext > 0 ? `Next in ${daysUntilNext}d` : daysUntilNext === 0 ? 'Due today' : `${Math.abs(daysUntilNext)}d late`}
              </span>
            )}
          </div>
          <p style={{fontSize:'.82rem',color:'var(--ink2)',margin:0,lineHeight:1.5}}>{currentPhase.desc}</p>
        </div>
      )}

      {nextStart && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16}}>
          {[['Next Period',nextStart,'#E85555'],['Ovulation Est.',ovulationDay,'#4CAF50']].map(([label,date,col])=>(
            <div key={label} style={{background:'var(--stone)',borderRadius:10,padding:'12px',textAlign:'center'}}>
              <p className="muted" style={{fontSize:'.72rem',margin:'0 0 4px'}}>{label}</p>
              <strong style={{color:col,fontSize:'.9rem'}}>{date}</strong>
            </div>
          ))}
        </div>
      )}

      <div style={{marginBottom:16}}>
        <p style={{fontWeight:600,fontSize:'.85rem',marginBottom:8}}>Log Symptoms — {logDate}</p>
        <input type="date" value={logDate} onChange={e=>setLogDate(e.target.value)}
          style={{width:'100%',padding:'8px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem',marginBottom:10,boxSizing:'border-box'}} />
        <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
          {SYMPTOM_OPTIONS.map(s => {
            const active = (symptoms[logDate]||[]).includes(s)
            return (
              <button key={s} onClick={()=>{
                const cur = symptoms[logDate]||[]
                const next = active ? cur.filter(x=>x!==s) : [...cur,s]
                const updated = {...symptoms,[logDate]:next}
                setSymptoms(updated); lsS('symptoms',updated)
              }} style={{
                padding:'6px 12px',borderRadius:999,fontSize:'.78rem',cursor:'pointer',fontWeight:500,
                background:active?'#E85555':'var(--stone)',color:active?'white':'var(--ink2)',
                border:active?'none':'1.5px solid var(--border2)'
              }}>{s}</button>
            )
          })}
        </div>
      </div>

      <div>
        <p style={{fontWeight:600,fontSize:'.85rem',marginBottom:8}}>Period History</p>
        {cycles.length === 0 && <p className="muted" style={{fontSize:'.82rem',marginBottom:10}}>No cycles logged yet.</p>}
        {cycles.slice(0,8).map((c,i)=>(
          <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--border)',fontSize:'.85rem'}}>
            <span>{c.start} → {c.end}</span>
            <button onClick={()=>saveCycles(cycles.filter((_,j)=>j!==i))}
              style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}}>✕</button>
          </div>
        ))}
        <div style={{display:'flex',gap:8,marginTop:10}}>
          <input type="date" value={cycleStart} onChange={e=>setCycleStart(e.target.value)}
            style={{flex:1,padding:'8px 10px',border:'1.5px solid var(--border2)',borderRadius:6,fontSize:'.82rem'}} />
          <input type="date" value={cycleEnd} onChange={e=>setCycleEnd(e.target.value)}
            style={{flex:1,padding:'8px 10px',border:'1.5px solid var(--border2)',borderRadius:6,fontSize:'.82rem'}} />
          <button className="primary-btn" style={{padding:'8px 14px',fontSize:'.82rem'}} onClick={()=>{
            if(!cycleStart||!cycleEnd) return
            saveCycles([{start:cycleStart,end:cycleEnd,id:Date.now()},...cycles])
            setCycleStart(''); setCycleEnd('')
          }}>+ Log</button>
        </div>
      </div>
    </section>
  )
}



export default ProductivityPage

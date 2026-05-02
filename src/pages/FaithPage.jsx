import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { usePlannerData } from '../context/PlannerContext.jsx'
import { getTodayString } from '../utils/dates.js'

function FaithPage() {
  const lsGet = (k, d) => { try { const v = localStorage.getItem('planner.faith.' + k); return v ? JSON.parse(v) : d } catch { return d } }
  const lsSet = (k, v) => { try { localStorage.setItem('planner.faith.' + k, JSON.stringify(v)) } catch {} }

  const [tab, setTab] = useState('devotional')

  // Prayer journal state
  const [prayers, setPrayers] = useState(() => lsGet('prayers', []))
  const [newPrayer, setNewPrayer] = useState({ text: '', type: 'Request', answered: false })
  const savePrayers = (v) => { setPrayers(v); lsSet('prayers', v) }

  // Scripture journal state
  const [scriptures, setScriptures] = useState(() => lsGet('scriptures', []))
  const [newScripture, setNewScripture] = useState({ reference: '', text: '', reflection: '' })
  const saveScriptures = (v) => { setScriptures(v); lsSet('scriptures', v) }

  // Gratitude state
  const [gratitude, setGratitude] = useState(() => lsGet('gratitude', []))
  const [newGratitude, setNewGratitude] = useState('')
  const saveGratitude = (v) => { setGratitude(v); lsSet('gratitude', v) }

  // Devotional journal
  const [devotional, setDevotional] = useState(() => lsGet('devotional', { text: '', date: '' }))
  const saveDevotional = (v) => { setDevotional(v); lsSet('devotional', v) }

  // Fasting tracker
  const [fasting, setFasting] = useState(() => lsGet('fasting', { active: false, startDate: '', endDate: '', intention: '', log: [] }))
  const saveFasting = (v) => { setFasting(v); lsSet('fasting', v) }

  // Faith goals
  const [faithGoals, setFaithGoals] = useState(() => lsGet('faithGoals', []))
  const [newFaithGoal, setNewFaithGoal] = useState({ text: '', category: 'Spiritual Growth', done: false })
  const saveFaithGoals = (v) => { setFaithGoals(v); lsSet('faithGoals', v) }

  // Sermon notes
  const [sermons, setSermons] = useState(() => lsGet('sermons', []))
  const [newSermon, setNewSermon] = useState({ date: new Date().toISOString().slice(0,10), speaker: '', title: '', notes: '', application: '' })
  const saveSermons = (v) => { setSermons(v); lsSet('sermons', v) }

  const TODAY = new Date().toISOString().slice(0,10)
  const todayGratitude = gratitude.filter(g => g.date === TODAY)
  const answeredPrayers = prayers.filter(p => p.answered).length

  const TABS = [
    { id: 'devotional', label: '📖 Devotional' },
    { id: 'prayer', label: '🙏 Prayer' },
    { id: 'scripture', label: '📜 Scripture' },
    { id: 'gratitude', label: '🌸 Gratitude' },
    { id: 'fasting', label: '⚡ Fasting' },
    { id: 'sermons', label: '🎙 Sermons' },
    { id: 'goals', label: '🎯 Faith Goals' },
  ]

  return (
    <div className="screen-stack">
      <div style={{display:'flex',alignItems:'center',gap:8,paddingBottom:2}}>
        <span style={{fontSize:'1.1rem'}}>✝</span>
        <p style={{fontSize:'.62rem',fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',color:'var(--brass)',margin:0}}>Faith</p>
      </div>

      {/* Stats strip */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
        {[
          ['🙏', prayers.filter(p=>!p.answered).length+' Active', 'Prayers'],
          ['✅', answeredPrayers+' Answered', 'Prayers'],
          ['🌸', todayGratitude.length+' Today', 'Gratitude'],
        ].map(([icon,val,label]) => (
          <div key={label+val} style={{background:'var(--stone)',borderRadius:10,padding:'10px',textAlign:'center'}}>
            <div style={{fontSize:'1.1rem',marginBottom:2}}>{icon}</div>
            <div style={{fontWeight:700,fontSize:'.88rem',color:'var(--brass)'}}>{val}</div>
            <div className="muted" style={{fontSize:'.7rem'}}>{label}</div>
          </div>
        ))}
      </div>

      <div className="pill-row" style={{ overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 4 }}>
        {TABS.map(t => (
          <button key={t.id} className={tab === t.id ? 'pill active-pill' : 'pill'}
            onClick={() => setTab(t.id)} style={{ whiteSpace: 'nowrap', fontSize: '.82rem' }}>{t.label}
          </button>
        ))}
      </div>

      {/* ── DEVOTIONAL ─────────────────────────────────────────────────────── */}
      {tab === 'devotional' && (
        <section className="card">
          <p className="eyebrow">Daily Devotional</p>
          <h3 style={{ margin: '4px 0 8px' }}>Time with God</h3>
          <p className="muted" style={{fontSize:'.8rem',marginBottom:14}}>Use this space for your daily quiet time — reading, reflection, what God is speaking to you.</p>

          {/* Daily verse prompt */}
          <div style={{background:'var(--ink)',borderRadius:12,padding:'16px',marginBottom:16}}>
            <p className="eyebrow" style={{color:'var(--brass)',marginBottom:6}}>Today's Anchor</p>
            {[
              '"Trust in the Lord with all your heart and lean not on your own understanding." — Proverbs 3:5',
              '"I can do all things through Christ who strengthens me." — Philippians 4:13',
              '"Be still and know that I am God." — Psalm 46:10',
              '"For I know the plans I have for you, declares the Lord, plans to prosper you." — Jeremiah 29:11',
              '"The Lord is my shepherd; I shall not want." — Psalm 23:1',
              '"Let your light shine before others, that they may see your good deeds." — Matthew 5:16',
              '"And we know that in all things God works for the good of those who love him." — Romans 8:28',
            ][new Date().getDay() % 7].split('—').map((part, i) => (
              i === 0
                ? <p key={i} style={{color:'white',fontSize:'.95rem',fontFamily:'var(--serif)',lineHeight:1.7,fontStyle:'italic',margin:'0 0 6px'}}>"{part.trim()}"</p>
                : <p key={i} style={{color:'var(--brass)',fontSize:'.78rem',fontWeight:600,margin:0}}>— {part.trim()}</p>
            ))}
          </div>

          <p style={{fontWeight:600,fontSize:'.85rem',marginBottom:6}}>Today's Reflection — {TODAY}</p>
          <textarea value={devotional.date === TODAY ? devotional.text : ''}
            onChange={e => saveDevotional({ text: e.target.value, date: TODAY })}
            placeholder="What is God speaking to you today? What did you read? What are you sensing?"
            style={{width:'100%',minHeight:200,padding:'12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',
            fontSize:'.9rem',fontFamily:'var(--serif)',lineHeight:1.7,resize:'vertical',background:'var(--warm-white)',color:'var(--ink)',boxSizing:'border-box'}} />
          <p className="muted" style={{fontSize:'.75rem',marginTop:6}}>Saved automatically.</p>
        </section>
      )}

      {/* ── PRAYER ─────────────────────────────────────────────────────────── */}
      {tab === 'prayer' && (
        <section className="card">
          <p className="eyebrow">Prayer Journal</p>
          <h3 style={{ margin: '4px 0 14px' }}>Your Prayer Life</h3>

          {/* Active prayers */}
          <p style={{fontWeight:600,fontSize:'.85rem',marginBottom:8}}>Active Requests</p>
          {prayers.filter(p => !p.answered).length === 0 && (
            <p className="muted" style={{fontSize:'.82rem',marginBottom:12,fontStyle:'italic'}}>No active prayer requests. Add one below.</p>
          )}
          {prayers.filter(p => !p.answered).map((prayer, i) => (
            <div key={prayer.id} style={{padding:'12px',background:'var(--stone)',borderRadius:10,marginBottom:8}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:'.78rem',color:'var(--brass)',fontWeight:600,marginBottom:4}}>{prayer.type} · {prayer.date}</div>
                  <div style={{fontSize:'.9rem',color:'var(--ink)',lineHeight:1.5}}>{prayer.text}</div>
                </div>
                <div style={{display:'flex',gap:6,flexShrink:0}}>
                  <button onClick={() => savePrayers(prayers.map(p => p.id===prayer.id ? {...p, answered:true, answeredDate:TODAY} : p))}
                    style={{background:'var(--success)',color:'white',border:'none',borderRadius:6,padding:'4px 8px',fontSize:'.72rem',cursor:'pointer',fontWeight:600}}>✓ Answered</button>
                  <button onClick={() => savePrayers(prayers.filter(p => p.id !== prayer.id))}
                    style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}}>✕</button>
                </div>
              </div>
            </div>
          ))}

          {/* Answered prayers */}
          {prayers.filter(p => p.answered).length > 0 && (
            <div style={{marginBottom:16}}>
              <p style={{fontWeight:600,fontSize:'.85rem',marginBottom:8,color:'var(--success)'}}>✓ Answered Prayers ({answeredPrayers})</p>
              {prayers.filter(p => p.answered).slice(0,5).map(prayer => (
                <div key={prayer.id} style={{padding:'10px 12px',background:'var(--success)18',borderRadius:8,marginBottom:6,display:'flex',justifyContent:'space-between',gap:8}}>
                  <div>
                    <div style={{fontSize:'.72rem',color:'var(--success)',fontWeight:600,marginBottom:2}}>Answered {prayer.answeredDate || ''}</div>
                    <div style={{fontSize:'.85rem',color:'var(--ink2)'}}>{prayer.text}</div>
                  </div>
                  <button onClick={() => savePrayers(prayers.filter(p => p.id !== prayer.id))}
                    style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',flexShrink:0}}>✕</button>
                </div>
              ))}
            </div>
          )}

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
        <section className="card">
          <p className="eyebrow">Scripture Journal</p>
          <h3 style={{ margin: '4px 0 14px' }}>God's Word in Your Life</h3>
          {scriptures.length === 0 && <p className="muted" style={{marginBottom:16,fontStyle:'italic'}}>No scriptures saved yet. Add one below.</p>}
          {scriptures.map((s, i) => (
            <div key={s.id} style={{padding:'14px',background:'var(--stone)',borderRadius:10,marginBottom:10}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                <strong style={{color:'var(--brass)',fontSize:'.85rem'}}>{s.reference}</strong>
                <button onClick={() => saveScriptures(scriptures.filter((_,j)=>j!==i))}
                  style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}}>✕</button>
              </div>
              <p style={{fontSize:'.9rem',fontFamily:'var(--serif)',lineHeight:1.7,margin:'0 0 8px',fontStyle:'italic',color:'var(--ink)'}}>{s.text}</p>
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
      )}

      {/* ── GRATITUDE ──────────────────────────────────────────────────────── */}
      {tab === 'gratitude' && (
        <section className="card">
          <p className="eyebrow">Gratitude Journal</p>
          <h3 style={{ margin: '4px 0 8px' }}>Count Your Blessings</h3>
          <p className="muted" style={{fontSize:'.8rem',marginBottom:14}}>A grateful heart is a powerful heart. Log at least 3 things daily.</p>
          <div style={{background:'var(--stone)',borderRadius:10,padding:'12px',marginBottom:14,display:'flex',justifyContent:'space-between'}}>
            <div><p className="muted" style={{fontSize:'.72rem',margin:'0 0 2px'}}>Today</p><strong style={{color:'var(--brass)'}}>{todayGratitude.length} entries</strong></div>
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
          {gratitude.slice(0, 30).reduce((groups, item) => {
            const g = groups.find(g => g.date === item.date)
            if (g) g.items.push(item)
            else groups.push({ date: item.date, items: [item] })
            return groups
          }, [])

.map(group => (
            <div key={group.date} style={{marginBottom:14}}>
              <p style={{fontSize:'.78rem',fontWeight:700,color:'var(--brass)',marginBottom:6}}>
                {group.date === TODAY ? 'Today' : group.date}
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
      )}

      {/* ── FASTING ────────────────────────────────────────────────────────── */}
      {tab === 'fasting' && (
        <section className="card">
          <p className="eyebrow">Fasting Tracker</p>
          <h3 style={{ margin: '4px 0 8px' }}>Discipline & Consecration</h3>
          <p className="muted" style={{fontSize:'.8rem',marginBottom:16}}>Fasting is a powerful spiritual discipline. Track your intentions and stay accountable.</p>
          {fasting.active ? (
            <div style={{background:'var(--ink)',borderRadius:12,padding:'16px',marginBottom:16}}>
              <p style={{color:'var(--brass)',fontWeight:700,fontSize:'.85rem',marginBottom:4}}>Active Fast</p>
              <p style={{color:'white',fontSize:'1rem',fontWeight:600,marginBottom:4}}>{fasting.intention || 'No intention set'}</p>
              <p style={{color:'rgba(255,255,255,.6)',fontSize:'.8rem'}}>{fasting.startDate} → {fasting.endDate || 'Open'}</p>
              <button onClick={() => saveFasting({...fasting, active:false, log:[...fasting.log, {start:fasting.startDate,end:TODAY,intention:fasting.intention}]})}
                style={{marginTop:12,background:'var(--danger)',color:'white',border:'none',borderRadius:8,padding:'8px 16px',cursor:'pointer',fontWeight:600,fontSize:'.85rem'}}>
                End Fast
              </button>
            </div>
          ) : (
            <div style={{padding:'14px',background:'var(--stone)',borderRadius:10,marginBottom:16,display:'grid',gap:8}}>
              <p style={{fontWeight:600,fontSize:'.85rem',margin:0}}>Begin a Fast</p>
              <input placeholder="Intention / Purpose" value={fasting.intention || ''}
                onChange={e => saveFasting({...fasting, intention: e.target.value})}
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
          {fasting.log.length > 0 && (
            <div>
              <p style={{fontWeight:600,fontSize:'.85rem',marginBottom:8}}>Fast History</p>
              {fasting.log.map((entry, i) => (
                <div key={i} style={{padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
                  <div style={{fontWeight:600,fontSize:'.88rem'}}>{entry.intention || 'Fast'}</div>
                  <div className="muted" style={{fontSize:'.75rem'}}>{entry.start} → {entry.end}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── SERMONS ────────────────────────────────────────────────────────── */}
      {tab === 'sermons' && (
        <section className="card">
          <p className="eyebrow">Sermon Notes</p>
          <h3 style={{ margin: '4px 0 14px' }}>Capture What God Says</h3>
          {sermons.map((s, i) => (
            <div key={s.id} style={{padding:'14px',background:'var(--stone)',borderRadius:10,marginBottom:10}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
                <div>
                  <strong style={{fontSize:'.9rem'}}>{s.title || 'Untitled'}</strong>
                  <div className="muted" style={{fontSize:'.75rem'}}>{s.speaker} · {s.date}</div>
                </div>
                <button onClick={() => saveSermons(sermons.filter((_,j)=>j!==i))}
                  style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}}>✕</button>
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
      )}

      {/* ── FAITH GOALS ─────────────────────────────────────────────────────── */}
      {tab === 'goals' && (
        <section className="card">
          <p className="eyebrow">Faith Goals</p>
          <h3 style={{ margin: '4px 0 14px' }}>Growing in the Spirit</h3>
          {faithGoals.length === 0 && <p className="muted" style={{marginBottom:16,fontStyle:'italic'}}>No faith goals yet. What is God calling you to grow in?</p>}
          {faithGoals.map((goal, i) => (
            <div key={goal.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
              <div onClick={() => saveFaithGoals(faithGoals.map((g,j) => j===i ? {...g, done:!g.done} : g))}
                style={{width:22,height:22,borderRadius:6,border:'2px solid',borderColor:goal.done?'var(--success)':'var(--brass)',
                background:goal.done?'var(--success)':'transparent',flexShrink:0,cursor:'pointer',
                display:'flex',alignItems:'center',justifyContent:'center'}}>
                {goal.done && <span style={{color:'white',fontSize:'.8rem',fontWeight:700}}>✓</span>}
              </div>
              <div style={{flex:1}}>
                <div style={{fontWeight:600,fontSize:'.88rem',textDecoration:goal.done?'line-through':'none',color:goal.done?'var(--muted)':'var(--ink)'}}>{goal.text}</div>
                <div className="muted" style={{fontSize:'.72rem'}}>{goal.category}</div>
              </div>
              <button onClick={() => saveFaithGoals(faithGoals.filter((_,j)=>j!==i))}
                style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}}>✕</button>
            </div>
          ))}
          <div style={{marginTop:16,display:'grid',gap:8}}>
            <p style={{fontWeight:600,fontSize:'.85rem',margin:0}}>Add a Faith Goal</p>
            <input placeholder="e.g. Read the Bible in a year" value={newFaithGoal.text}
              onChange={e => setNewFaithGoal(p => ({...p, text: e.target.value}))}
              style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}} />
            <select value={newFaithGoal.category} onChange={e => setNewFaithGoal(p => ({...p, category: e.target.value}))}
              style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}}>
              {['Spiritual Growth','Prayer Life','Scripture Study','Community/Church','Service','Fasting','Evangelism','Discipleship'].map(c => <option key={c}>{c}</option>)}
            </select>
            <button className="primary-btn" onClick={() => {
              if (!newFaithGoal.text.trim()) return
              saveFaithGoals([{...newFaithGoal, id: Date.now(), done: false}, ...faithGoals])
              setNewFaithGoal({ text: '', category: 'Spiritual Growth', done: false })
            }}>+ Add Goal</button>
          </div>
        </section>
      )}
    </div>
  )
}



export default FaithPage

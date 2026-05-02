import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { usePlannerData } from '../context/PlannerContext.jsx'
import { getGoalProgress } from '../utils/scoring.js'
import { getTodayString } from '../utils/dates.js'

function GoalsPage({ goals, tasks, projects, onEdit, onDelete, onQuickCreate }) {
  const [activeFrame, setActiveFrame] = useState('all')
  const [visionItems, setVisionItems] = useState(() => { try { const v = localStorage.getItem('planner.g.vision'); return v ? JSON.parse(v) : [] } catch { return [] } })
  const [newVision, setNewVision] = useState('')
  const saveVision = (v) => { setVisionItems(v); try { localStorage.setItem('planner.g.vision', JSON.stringify(v)) } catch {} }

  const TIMEFRAMES = [
    {id:'all',label:'All'},
    {id:'1wk',label:'1 Week'},
    {id:'1mo',label:'1 Month'},
    {id:'6mo',label:'6 Months'},
    {id:'1yr',label:'1 Year'},
    {id:'3yr',label:'3 Years'},
    {id:'5yr',label:'5 Years'},
  ]

  const SMART_GUIDE = [
    {letter:'S',word:'Specific',desc:'Exactly what do you want to accomplish? Be precise — not "get fit" but "run a 5K in under 30 minutes."'},
    {letter:'M',word:'Measurable',desc:'How will you know you achieved it? Define the number, date, or result that proves success.'},
    {letter:'A',word:'Achievable',desc:'Is this goal realistic given your current resources, time, and capacity? Challenge yourself but stay honest.'},
    {letter:'R',word:'Relevant',desc:'Does this align with your values and your bigger vision? A goal worth achieving should matter deeply.'},
    {letter:'T',word:'Time-Bound',desc:'What is the deadline? Without a date it is a dream, not a goal. Set a specific target date.'},
  ]

  const filtered = activeFrame === 'all' ? goals : goals.filter(g => g.timeframe === activeFrame)

  return (
    <div className="screen-stack">
      <div style={{display:'flex',alignItems:'center',gap:8,paddingBottom:2}}>
        <span style={{fontSize:'1.1rem'}}>🎯</span>
        <p style={{fontSize:'.62rem',fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',color:'var(--brass)',margin:0}}>Goals</p>
      </div>

      {/* SMART goals guide */}
      <section className="card" style={{background:'var(--ink)',border:'none'}}>
        <p className="eyebrow" style={{color:'var(--brass)'}}>How to Set Goals That Work</p>
        <h3 style={{color:'var(--warm-white)',margin:'4px 0 14px',fontSize:'1.1rem'}}>The SMART Framework</h3>
        <div style={{display:'grid',gap:10}}>
          {SMART_GUIDE.map(s => (
            <div key={s.letter} style={{display:'flex',gap:12,alignItems:'flex-start'}}>
              <div style={{
                width:32,height:32,borderRadius:8,flexShrink:0,
                background:'var(--brass)',color:'var(--ink)',
                display:'grid',placeItems:'center',
                fontFamily:'var(--serif)',fontSize:'1.1rem',fontWeight:600
              }}>{s.letter}</div>
              <div>
                <div style={{fontWeight:700,fontSize:'.85rem',color:'var(--warm-white)',marginBottom:2}}>{s.word}</div>
                <div style={{fontSize:'.78rem',color:'rgba(255,255,255,.55)',lineHeight:1.5}}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Timeframe filter */}
      <section className="card" style={{padding:'12px 14px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
          <div><p className="eyebrow">Your Goals</p></div>
          <button className="primary-btn" style={{fontSize:'.8rem',padding:'6px 14px'}} onClick={() => onQuickCreate('goal')}>+ Goal</button>
        </div>
        <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
          {TIMEFRAMES.map(tf => (
            <button key={tf.id} onClick={() => setActiveFrame(tf.id)} style={{
              padding:'5px 10px',borderRadius:999,border:'1.5px solid',fontSize:'.75rem',
              cursor:'pointer',fontFamily:'var(--sans)',fontWeight:600,
              borderColor: activeFrame===tf.id ? 'var(--brass)' : 'var(--border2)',
              background: activeFrame===tf.id ? 'var(--brass-dim)' : 'transparent',
              color: activeFrame===tf.id ? 'var(--brass)' : 'var(--muted)'
            }}>{tf.label}</button>
          ))}
        </div>
      </section>

      {filtered.length === 0 && (
        <section className="card" style={{textAlign:'center',padding:'28px 20px'}}>
          <div style={{fontSize:'2rem',marginBottom:10}}>🎯</div>
          <div style={{fontWeight:700,color:'var(--ink)',marginBottom:6}}>No goals yet</div>
          <p className="muted" style={{fontSize:'.85rem',marginBottom:14}}>Use the SMART framework above to set your first goal.</p>
          <button className="primary-btn" onClick={() => onQuickCreate('goal')}>Set Your First Goal</button>
        </section>
      )}

      {filtered.map(goal => {
        const progress = getGoalProgress(goal.id, tasks, projects)
        const linkedTasks = tasks.filter(t => t.linkedGoalId === goal.id)
        const tf = TIMEFRAMES.find(t => t.id === goal.timeframe)
        return (
          <section key={goal.id} className="card">
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap'}}>
                  <div style={{fontWeight:700,fontSize:'1rem',color:'var(--ink)'}}>{goal.title}</div>
                  {tf && tf.id !== 'all' && (
                    <span style={{fontSize:'.65rem',padding:'2px 8px',borderRadius:999,background:'var(--brass-dim)',color:'var(--brass)',fontWeight:700}}>{tf.label}</span>
                  )}
                </div>
                {goal.description && <div style={{fontSize:'.82rem',color:'var(--muted)',lineHeight:1.5,marginBottom:6}}>{goal.description}</div>}
                <div style={{fontSize:'.75rem',color:'var(--muted)'}}>{goal.category} · Due {goal.targetDate}</div>
              </div>
              <div style={{display:'flex',gap:6,flexShrink:0,marginLeft:8}}>
                <button className="ghost-btn" style={{fontSize:'.72rem',padding:'4px 8px'}} onClick={() => onEdit('goal',goal)}>Edit</button>
                <button style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}} onClick={() => onDelete('goal',goal.id)}>✕</button>
              </div>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:4,fontSize:'.78rem'}}>
              <span style={{color:'var(--muted)'}}>{linkedTasks.length} linked task{linkedTasks.length!==1?'s':''}</span>
              <strong style={{color: progress>=100?'var(--success)':'var(--brass)'}}>{progress}%</strong>
      
      

      </div>
            <div style={{height:6,background:'var(--stone2)',borderRadius:999,overflow:'hidden'}}>
              <div style={{height:'100%',width:`${progress}%`,background:progress>=100?'var(--success)':'var(--brass)',borderRadius:999,transition:'width .4s'}} />
            </div>
          </section>
        )
      })}

      {/* ── Vision & Affirmations ───────────────────────────────────────── */}
      <section className="card" style={{background:'var(--ink)',border:'none',padding:'12px 14px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
          <p className="eyebrow" style={{color:'var(--brass)',fontSize:'.6rem',margin:0}}>Vision & Affirmations</p>
          <span style={{fontSize:'.72rem',color:'rgba(255,255,255,.4)'}}>{visionItems.length} saved</span>
        </div>
        {visionItems.length === 0
          ? <p style={{color:'rgba(255,255,255,.4)',fontSize:'.8rem',margin:'0 0 8px',fontStyle:'italic'}}>Speak it before you see it. Add yours below.</p>
          : <div style={{maxHeight:140,overflowY:'auto',marginBottom:8}}>
              {visionItems.map((item,i) => (
                <div key={i} style={{display:'flex',alignItems:'flex-start',gap:8,padding:'6px 0',borderBottom:'1px solid rgba(255,255,255,.06)'}}>
                  <span style={{color:'var(--brass)',fontSize:'.85rem',flexShrink:0}}>✦</span>
                  <div style={{flex:1,fontFamily:'var(--serif)',fontSize:'.85rem',color:'rgba(255,255,255,.8)',lineHeight:1.5,fontStyle:'italic'}}>{item.text}</div>
                  <button onClick={()=>saveVision(visionItems.filter((_,j)=>j!==i))}
                    style={{background:'none',border:'none',color:'rgba(255,255,255,.25)',cursor:'pointer',flexShrink:0,fontSize:'.85rem'}}>✕</button>
                </div>
              ))}
            </div>
        }
        <div style={{display:'flex',gap:6}}>
          <input value={newVision} onChange={e=>setNewVision(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter'&&newVision.trim()){saveVision([...visionItems,{text:newVision.trim(),id:Date.now()}]);setNewVision('')}}}
            placeholder="I am... I have... I will..."
            style={{flex:1,padding:'8px 10px',border:'1px solid rgba(184,150,90,.3)',borderRadius:'var(--radius-sm)',
            fontSize:'.82rem',background:'rgba(255,255,255,.05)',color:'white',fontFamily:'var(--serif)'}} />
          <button onClick={()=>{if(!newVision.trim())return;saveVision([...visionItems,{text:newVision.trim(),id:Date.now()}]);setNewVision('')}}
            style={{padding:'8px 12px',borderRadius:'var(--radius-sm)',border:'none',background:'var(--brass)',
            color:'var(--ink)',fontWeight:700,cursor:'pointer',fontSize:'.82rem',flexShrink:0}}>Add</button>
        </div>
      </section>

    </div>
  )
}



export default GoalsPage

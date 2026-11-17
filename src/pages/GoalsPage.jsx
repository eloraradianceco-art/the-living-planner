// Goals.
import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Target, Folder } from 'lucide-react'
import { hasSupabaseEnv, supabase } from '../lib/supabase.js'
import { shortDate } from '../lib/dates.js'
import { normalizeSteps, getProjectProgress, goalDirectTasks, getGoalProgress } from '../lib/steps.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { PageNav } from '../components/PageNav.jsx'
import { ReadyToComplete, isReadyDismissed, StepsChecklist } from '../components/StepsChecklist.jsx'
import { EmptyState } from '../components/EmptyState.jsx'
import { PageHeader } from '../components/PageHeader.jsx'
import { useOwnWrites, useRemotePageData } from '../lib/pageData.js'

function GoalsPage({ goals, tasks, projects, onEdit, onDelete, onQuickCreate, onStepsChange, onUpdate }) {
  const [, bumpReady] = useState(0) // re-render after "Not yet" on a finished goal
  const { user } = useAuth()

  const ownPage = useOwnWrites()
  const syncPageData = React.useCallback(async (key, value) => {
    try { localStorage.setItem('planner.g.' + key, JSON.stringify(value)) } catch {}
    const at = ownPage.mark(key)
    if (!user || !hasSupabaseEnv) return
    try {
      await supabase.from('page_data').upsert({
        user_id: user.id, page: 'goals', data_key: key, data_value: value,
        updated_at: at
      }, { onConflict: 'user_id,page,data_key' })
    } catch (e) { console.error('Goals sync error:', e) }
  }, [user?.id, ownPage])

  React.useEffect(() => {
    if (!user || !hasSupabaseEnv) return
    supabase.from('page_data').select('data_key, data_value')
      .eq('user_id', user.id).eq('page', 'goals')
      .then(({ data, error }) => {
        if (error || !data) return
        data.forEach(row => {
          if (ownPage.wrote(row.data_key)) return
          if (row.data_key === 'visionItems') { setVisionItems(row.data_value || []); try { localStorage.setItem('planner.g.visionItems', JSON.stringify(row.data_value || [])) } catch {} }
        })
      })
  }, [user?.id])
  useRemotePageData('goals', ownPage, (key, value) => {
    if (key !== 'visionItems') return
    setVisionItems(value || [])
    try { localStorage.setItem('planner.g.visionItems', JSON.stringify(value || [])) } catch {}
  })

  const [activeFrame, setActiveFrame] = useState('all')
  const [visionItems, setVisionItems] = useState(() => { try { const v = localStorage.getItem('planner.g.visionItems') ?? localStorage.getItem('visionItems') ?? localStorage.getItem('planner.g.vision'); return v ? JSON.parse(v) : [] } catch { return [] } })
  const [newVision, setNewVision] = useState('')
  const saveVision = (v) => { setVisionItems(v); syncPageData('visionItems', v) }

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
      <PageHeader icon={Target} title="Goals" subtitle="Aim with intention" />

      {/* SMART goals guide */}
      {/* Open by default until you have goals; then it folds away so your goals lead the page */}
      <details className="card smart-guide" style={{background:'var(--ink)',border:'none'}} open={goals.length === 0 || undefined}>
        <summary>
          <p className="eyebrow" style={{color:'var(--brass-fg)'}}>How to Set Goals That Work</p>
          <h3 style={{color:'var(--warm-white)',margin:'4px 0 0',fontSize:'1.1rem'}}>The SMART Framework</h3>
        </summary>
        <div style={{display:'grid',gap:10,marginTop:14}}>
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
      </details>

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
              color: activeFrame===tf.id ? 'var(--brass-fg)' : 'var(--muted)'
            }}>{tf.label}</button>
          ))}
        </div>
      </section>

      {filtered.length === 0 && (
        <section className="card">
          <EmptyState icon="🎯"
            title={goals.length ? 'No goals in this timeframe' : 'Aim at something'}
            message={goals.length ? 'Pick another timeframe above.' : 'Set one goal using the SMART framework above, then break it into steps.'}
            action={goals.length ? null : '+ Set your first goal'} onAction={() => onQuickCreate('goal')} />
        </section>
      )}

      {filtered.slice().sort((a, b) => Number(!!a.completed) - Number(!!b.completed)).map(goal => {
        const progress = getGoalProgress(goal, tasks, projects)
        const linkedProjects = projects.filter(p => p.goalId === goal.id)
        const linkedTasks = goalDirectTasks(goal.id, tasks, projects)
        const completedLinked = linkedTasks.filter(t => t.completed).length
        const steps = normalizeSteps(goal.steps)
        const stepsDone = steps.filter(st => st.done).length
        const tf = TIMEFRAMES.find(t => t.id === goal.timeframe)
        const summary = [
          steps.length ? `${stepsDone}/${steps.length} steps` : null,
          linkedTasks.length ? `${completedLinked}/${linkedTasks.length} tasks` : null,
          linkedProjects.length ? `${linkedProjects.length} project${linkedProjects.length !== 1 ? 's' : ''}` : null,
        ].filter(Boolean).join(' · ') || 'No steps yet'
        return (
          <section key={goal.id} className="card" style={goal.completed ? {opacity:.78} : undefined}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap'}}>
                  <div style={{fontWeight:700,fontSize:'1rem',color:'var(--ink)'}}>{goal.title}</div>
                  {tf && tf.id !== 'all' && (
                    <span style={{fontSize:'.65rem',padding:'2px 8px',borderRadius:999,background:'var(--brass-dim)',color:'var(--brass-fg)',fontWeight:700}}>{tf.label}</span>
                  )}
                  {goal.completed && (
                    <span style={{fontSize:'.65rem',padding:'2px 8px',borderRadius:999,background:'rgba(34,197,94,.12)',color:'var(--success)',fontWeight:700}}>Achieved</span>
                  )}
                </div>
                {goal.description && <div style={{fontSize:'.82rem',color:'var(--muted)',lineHeight:1.5,marginBottom:6}}>{goal.description}</div>}
                {goal.why && <div style={{fontFamily:'var(--serif)',fontStyle:'italic',fontSize:'.86rem',color:'var(--ink2)',lineHeight:1.5,marginBottom:6}}>“{goal.why}”</div>}
                <div style={{fontSize:'.75rem',color:'var(--muted)'}}>{[goal.category, goal.targetDate ? `Due ${shortDate(goal.targetDate)}` : null].filter(Boolean).join(' · ')}</div>
              </div>
              <div style={{display:'flex',gap:6,flexShrink:0,marginLeft:8}}>
                <button className="ghost-btn" style={{fontSize:'.72rem',padding:'4px 8px'}} onClick={() => onEdit('goal',goal)}>Edit</button>
                <button style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}} onClick={() => onDelete('goal',goal.id)} aria-label="Delete goal">✕</button>
              </div>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:4,fontSize:'.78rem'}}>
              <span style={{color:'var(--muted)'}}>{summary}</span>
              <strong style={{color: progress>=100?'var(--success)':'var(--brass-fg)'}}>{progress}%</strong>
            </div>
            <div style={{height:6,background:'var(--stone2)',borderRadius:999,overflow:'hidden'}}>
              <div style={{height:'100%',width:`${progress}%`,background:progress>=100?'var(--success)':'linear-gradient(90deg, var(--brass2), var(--brass))',borderRadius:999,transition:'width .4s'}} />
            </div>

            {linkedProjects.length > 0 && (
              <div style={{display:'grid',gap:4,marginTop:10}}>
                {linkedProjects.map(p => (
                  <Link key={p.id} to="/projects" style={{display:'flex',alignItems:'center',gap:8,fontSize:'.78rem',color:'var(--ink2)',textDecoration:'none'}}>
                    <Folder size={13} color="var(--brass)" />
                    <span style={{flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.title}</span>
                    <span style={{color:'var(--muted)',fontVariantNumeric:'tabular-nums'}}>{getProjectProgress(p, tasks)}%</span>
                  </Link>
                ))}
              </div>
            )}

            {!goal.completed && onUpdate && progress >= 100 && (
              <ReadyToComplete id={goal.id} kind="goal" onDismiss={() => bumpReady((n) => n + 1)} onComplete={() => onUpdate('goal', { ...goal, completed: true }, 'edit')} />
            )}

            <StepsChecklist
              steps={steps}
              onChange={(next) => onStepsChange && onStepsChange(goal.id, next)}
              onSchedule={(step) => onQuickCreate('task', { title: step.text, linkedGoalId: goal.id, category: goal.category || 'Productivity' })}
              hideDoneNote={progress >= 100}
              completeSlot={!goal.completed && onUpdate && progress < 100 && (
                <button type="button" className="steps-complete-btn" onClick={() => onUpdate('goal', { ...goal, completed: true }, 'edit')}>Mark goal achieved</button>
              )} />

            <div style={{display:'flex',gap:14,alignItems:'center',marginTop:12,flexWrap:'wrap'}}>
              <button onClick={() => onQuickCreate('task', { linkedGoalId: goal.id, category: goal.category || 'Productivity' })}
                style={{background:'none',border:'none',color:'var(--brass-fg)',cursor:'pointer',fontSize:'.8rem',fontWeight:600,fontFamily:'inherit',padding:0}}>+ Schedule a task</button>
              <button onClick={() => onQuickCreate('project', { goalId: goal.id })}
                style={{background:'none',border:'none',color:'var(--ink2)',cursor:'pointer',fontSize:'.8rem',fontWeight:600,fontFamily:'inherit',padding:0}}>+ Project for this goal</button>
              {!goal.completed && onUpdate && progress >= 100 && isReadyDismissed('goal', goal.id) && (
                <button onClick={() => onUpdate('goal', { ...goal, completed: true }, 'edit')}
                  style={{background:'none',border:'none',color:'var(--success)',cursor:'pointer',fontSize:'.8rem',fontWeight:600,fontFamily:'inherit',padding:0}}>Mark goal achieved</button>
              )}
              {goal.completed && onUpdate && (
                <button onClick={() => onUpdate('goal', { ...goal, completed: false }, 'edit')}
                  style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:'.8rem',fontWeight:600,fontFamily:'inherit',padding:0}}>Reopen goal</button>
              )}
            </div>
          </section>
        )
      })}

      {/* ── Vision & Affirmations ───────────────────────────────────────── */}
      <section className="card" style={{background:'var(--ink)',border:'none',padding:'12px 14px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
          <p className="eyebrow" style={{color:'var(--brass-fg)',fontSize:'.6rem',margin:0}}>Vision & Affirmations</p>
          <span style={{fontSize:'.72rem',color:'rgba(255,255,255,.64)'}}>{visionItems.length} saved</span>
        </div>
        {visionItems.length === 0
          ? <p style={{color:'rgba(255,255,255,.64)',fontSize:'.8rem',margin:'0 0 8px',fontStyle:'italic'}}>Speak it before you see it. Add yours below.</p>
          : <div style={{maxHeight:140,overflowY:'auto',marginBottom:8}}>
              {visionItems.map((item,i) => (
                <div key={i} style={{display:'flex',alignItems:'flex-start',gap:8,padding:'6px 0',borderBottom:'1px solid rgba(255,255,255,.06)'}}>
                  <span style={{color:'var(--brass-fg)',fontSize:'.85rem',flexShrink:0}}>✦</span>
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

      <PageNav />
    </div>
  )
}

export { GoalsPage }

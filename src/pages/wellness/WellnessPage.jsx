// Health & Wellness page.
import React, { useState } from 'react'
import { Leaf, Gauge } from 'lucide-react'
import { hasSupabaseEnv, supabase } from '../../lib/supabase.js'
import { TODAY, addDays, getWeekDays, formatDateLabel, fmt12 } from '../../lib/dates.js'
import { emitPlannerData } from '../../lib/score.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { useUrlTab } from '../../shell/nav.js'
import { PRO_TABS, ProTabGate } from '../../components/Pro.jsx'
import { EmptyState } from '../../components/EmptyState.jsx'
import { PageHeader } from '../../components/PageHeader.jsx'
import { makeSections, SectionRows } from '../../components/Sections.jsx'
import { mergeLegacyWorkouts, markLegacyWorkoutsMoved, HW_PREFIX, hwRead, useOwnWrites, useRemotePageData } from '../../lib/pageData.js'
import { readinessOf, readinessBand } from './helpers.js'
import { sleepSpan, fmtHours } from '../../lib/sleep.js'
import { TrainingTab, RecoveryTab } from './TrainingRecovery.jsx'
import { DEFAULT_TARGETS, NutritionTab } from './NutritionTab.jsx'
import { CareTab } from './CareTab.jsx'

// One line under each row's name on this page (components/Sections.jsx)
const SECTION_SUBS = {
  training: 'Workouts and your training log',
  recovery: 'Daily readiness check-in',
  nutrition: 'Water, meals and targets',
  sleep: 'Hours and quality',
  metrics: 'Weight, blood pressure and measurements',
  journal: 'Write it out',
  routine: 'Your morning and evening rhythm',
  anxiety: 'Daily check-in and triggers',
  coping: 'Your toolkit for hard moments',
  care: 'Vitals, appointments and labs',
  meds: 'Medications and supplements',
  migraines: 'Log an episode',
}

const WELLNESS_GROUPS = [
  { label: 'Body', ids: ['training', 'recovery', 'nutrition', 'sleep', 'metrics'] },
  { label: 'Mind', ids: ['mood', 'journal', 'routine', 'anxiety', 'coping'] },
  { label: 'Care', ids: ['care', 'meds', 'migraines'] },
]

function HealthWellnessPage({ isPro = false, onUpgrade = () => {}, onAddEvent }) {
  const { user } = useAuth()
  const ownW = useOwnWrites()

  const syncPageData = React.useCallback(async (key, value) => {
    try { localStorage.setItem(HW_PREFIX + key, JSON.stringify(value)); localStorage.setItem(HW_PREFIX + key + '.at', String(Date.now())) } catch {}
    emitPlannerData('wellness', key, value)
    const at = ownW.mark(key)
    if (!user || !hasSupabaseEnv) return
    try {
      await supabase.from('page_data').upsert({
        user_id: user.id, page: 'wellness', data_key: key, data_value: value,
        updated_at: at
      }, { onConflict: 'user_id,page,data_key' })
    } catch (e) { console.error('Wellness sync error:', e) }
  }, [user?.id, ownW])

  // Which state each wellness key fills (load on open + other devices' saves)
  const applyWellness = (key, v) => {
    const set = {
      routine: () => setRoutine(v || []), meds: () => setMeds(v || []), anxiety: () => setAnxiety(v || []),
      migraines: () => setMigraines(v || []), waterLog: () => setWaterLog(v || {}), measurements: () => setMeasurements(v || []),
      journalEntries: () => setJournalEntries(v || []), routineLog: () => setRoutineLog(v || {}), wellnessLog: () => setWellnessLog(v || {}),
      medLog: () => setMedLog(v || {}), sleep: () => setSleep(v || []), copingUsed: () => setCopingUsed(v || {}),
      metricsLog: () => setMetricsLog(v || []), workouts: () => setWorkouts(v || []), recovery: () => setRecovery(v || {}),
      meals: () => setMeals(v || {}), nutritionTargets: () => setNutritionTargets({ ...DEFAULT_TARGETS, ...(v || {}) }),
      vitals: () => setVitals(v || []), appointments: () => setAppts(v || []), labs: () => setLabs(v || []),
    }[key]
    if (!set) return false
    set()
    return true
  }
  useRemotePageData('wellness', ownW, (key, value) => {
    if (!applyWellness(key, value)) return
    try { localStorage.setItem(HW_PREFIX + key, JSON.stringify(value)); localStorage.setItem(HW_PREFIX + key + '.at', String(Date.now())) } catch {}
    emitPlannerData('wellness', key, value)
  })

  React.useEffect(() => {
    if (!user || !hasSupabaseEnv) return
    supabase.from('page_data')
      .select('data_key, data_value')
      .eq('user_id', user.id).eq('page', 'wellness')
      .then(({ data, error }) => {
        if (error || !data) return
        data.forEach(row => {
          if (ownW.wrote(row.data_key)) return
          applyWellness(row.data_key, row.data_value)
        })
        // One-time move of workouts logged under Lifestyle (device-only) into synced Wellness
        const remote = (data.find((r) => r.data_key === 'workouts')?.data_value) || []
        const merged = mergeLegacyWorkouts(remote)
        if (merged !== remote && !ownW.wrote('workouts')) { setWorkouts(merged); syncPageData('workouts', merged) }
        markLegacyWorkoutsMoved()
      })
  }, [user?.id])

  // Offline/demo mode: keep the moved workouts locally
  React.useEffect(() => {
    if (hasSupabaseEnv) return
    const cur = lsGet('workouts', [])
    const merged = mergeLegacyWorkouts(cur)
    if (merged !== cur) syncPageData('workouts', merged)
    markLegacyWorkoutsMoved()
  }, [])

  // ── Shared ─────────────────────────────────────────────────────────────
  const lsGet = (k, d) => hwRead(k, d)
  const lsSet = (k, v) => { try { localStorage.setItem('planner.hw.' + k, JSON.stringify(v)) } catch {} }

  // ── Wellness state ──────────────────────────────────────────────────────

  const [routine, setRoutine] = useState(() => lsGet('routine', []))
  const [newRoutineItem, setNewRoutineItem] = useState({ time: '', label: '', type: 'morning' })
  const [routineLog, setRoutineLog] = useState(() => lsGet('routineLog', {}))
  const [wellnessLog, setWellnessLog] = useState(() => lsGet('wellnessLog', {}))
  const [journalEntries, setJournalEntries] = useState(() => lsGet('journalEntries', lsGet('journal', [])))
  // Unsaved journal text survives leaving the tab or closing the app (this device only)
  const [journalText, setJournalTextRaw] = useState(() => { try { return localStorage.getItem('planner.hw.journalDraft') || '' } catch { return '' } })
  const setJournalText = (v) => { setJournalTextRaw(v); try { v ? localStorage.setItem('planner.hw.journalDraft', v) : localStorage.removeItem('planner.hw.journalDraft') } catch {} }
  const [journalShown, setJournalShown] = useState(10)
  const [journalPrompt, setJournalPrompt] = useState(0)

  const saveRoutine = (r) => { setRoutine(r); syncPageData('routine', r) }
  const saveLog = (l) => { setRoutineLog(l); syncPageData('routineLog', l) }
  const saveWellness = (w) => { setWellnessLog(w); syncPageData('wellnessLog', w) }
  const saveJournal = (j) => { setJournalEntries(j); syncPageData('journalEntries', j) }

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



  // ── Health state ────────────────────────────────────────────────────────
  const [tab, setTab] = useUrlTab('mood')
  const S = makeSections() // each section below registers here; SectionRows lays them out (components/Sections.jsx)
  
  

  // tab state above
  const [metricsLog, setMetricsLog] = useState(() => { const v = lsGet('metricsLog', null); if (v) return v; try { const o = localStorage.getItem('planner.h.metrics'); return o ? JSON.parse(o) : [] } catch { return [] } })
  const [workouts, setWorkouts] = useState(() => mergeLegacyWorkouts(lsGet('workouts', [])))
  const [recovery, setRecovery] = useState(() => lsGet('recovery', {}))
  const saveWorkouts = (w) => { setWorkouts(w); syncPageData('workouts', w) }
  const saveRecovery = (r) => { setRecovery(r); syncPageData('recovery', r) }
  const [meals, setMeals] = useState(() => lsGet('meals', {}))
  const [nutritionTargets, setNutritionTargets] = useState(() => ({ ...DEFAULT_TARGETS, ...lsGet('nutritionTargets', {}) }))
  const [vitals, setVitals] = useState(() => lsGet('vitals', []))
  const [appts, setAppts] = useState(() => lsGet('appointments', []))
  const [labs, setLabs] = useState(() => lsGet('labs', []))
  const saveMeals = (m) => { setMeals(m); syncPageData('meals', m) }
  const saveTargets = (t) => { setNutritionTargets(t); syncPageData('nutritionTargets', t) }
  const saveVitals = (v) => { setVitals(v); syncPageData('vitals', v) }
  const saveAppts = (a) => { setAppts(a); syncPageData('appointments', a) }
  const saveLabs = (l) => { setLabs(l); syncPageData('labs', l) }
  const [newMetric, setNewMetric] = useState({ weight: '', bp: '', heartRate: '', waist: '', notes: '' })
  const saveMetrics = (m) => { setMetricsLog(m); syncPageData('metricsLog', m) }
  const [meds, setMeds] = useState(() => lsGet('meds', []))
  const [medLog, setMedLog] = useState(() => lsGet('medLog', {}))
  const [copingUsed, setCopingUsed] = useState(() => lsGet('copingUsed', {}))
  const saveCopingUsed = (v) => { setCopingUsed(v); syncPageData('copingUsed', v) }
  const todayCopingKey = TODAY
  const todayCopingUsed = copingUsed[todayCopingKey] || []
  const [anxiety, setAnxiety] = useState(() => lsGet('anxiety', []))
  const [migraines, setMigraines] = useState(() => lsGet('migraines', []))
  const [waterLog, setWaterLog] = useState(() => lsGet('waterLog', {}))
  const saveWaterLog = (w) => { setWaterLog(w); syncPageData('waterLog', w) }
  const [measurements, setMeasurements] = useState(() => lsGet('measurements', []))
  const saveMeasurements = (m) => { setMeasurements(m); syncPageData('measurements', m) }
  const [newMeasurement, setNewMeasurement] = useState({weight:'', waist:'', hip:'', bodyFat:'', date:TODAY})
  const [sleep, setSleep] = useState(() => lsGet('sleep', []))
  const [form, setForm] = useState({})

  const saveMeds = (m) => { setMeds(m); syncPageData('meds', m) }
  const saveMedLog = (l) => { setMedLog(l); syncPageData('medLog', l) }
  const saveAnxiety = (a) => { setAnxiety(a); syncPageData('anxiety', a) }
  const saveMigraines = (m) => { setMigraines(m); syncPageData('migraines', m) }
  const saveSleep = (s) => { setSleep(s); syncPageData('sleep', s) }

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
    {id:'mood',label:'😊 Mood'},{id:'training',label:'🏋️ Training'},{id:'recovery',label:'🔋 Recovery'},{id:'nutrition',label:'🥗 Nutrition'},{id:'sleep',label:'😴 Sleep'},
    {id:'journal',label:'✍ Journal'},{id:'routine',label:'🌅 Routine'},
    {id:'meds',label:'💊 Medications'},
    {id:'metrics',label:'📈 Body Metrics'},{id:'care',label:'🩺 Vitals & Care'},{id:'anxiety',label:'🧘 Anxiety'},
    {id:'migraines',label:'🤕 Migraines'},{id:'coping',label:'🛡 Coping Skills'},
  ]

  return (
    <div className="screen-stack">
      <PageHeader icon={Leaf} title="Health & Wellness" subtitle="Care for the whole person" />


      {/* ── Mood ─────────────────────────────────────────────────── */}
      {S.add('training', () => (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
          <TrainingTab workouts={workouts} onSave={saveWorkouts} />
        </ProTabGate>
      ))}
      {S.add('recovery', () => (<ProTabGate isPro={isPro} onUpgrade={onUpgrade}><RecoveryTab checkins={recovery} onSave={saveRecovery} sleep={sleep} /></ProTabGate>))}
      {S.add('nutrition', () => (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
          <section className="card" style={{marginBottom:14}}>
          {/* Water Intake */}
          <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
              <p style={{fontSize:'.72rem',color:'var(--ink2)',fontWeight:600,letterSpacing:'.06em',textTransform:'uppercase',margin:0}}>Water today</p>
              <strong style={{fontSize:'.85rem',color:'var(--brass-fg)'}}>{waterLog[TODAY] || 0} / 8 cups</strong>
            </div>
            <div style={{display:'flex',gap:6,marginBottom:8}}>
              {Array.from({length: 8}).map((_, i) => {
                const filled = (waterLog[TODAY] || 0) > i
                return (
                  <button key={i} onClick={() => {
                    const current = waterLog[TODAY] || 0
                    saveWaterLog({...waterLog, [TODAY]: i+1 <= current ? i : i+1})
                  }} style={{
                    flex:1, aspectRatio:'1', borderRadius:8, cursor:'pointer',
                    background: filled ? 'var(--ink)' : 'transparent',
                    border: filled ? '1.5px solid var(--ink)' : '1.5px solid var(--border2)',
                    color: filled ? 'var(--brass-fg)' : 'var(--muted)',
                    fontSize:'.9rem',padding:0,
                  }}>{filled ? '●' : ''}</button>
                )
              })}
            </div>
            <p className="muted" style={{fontSize:'.74rem',margin:0,fontStyle:'italic'}}>Tap to log each cup (8oz). Goal: 64oz daily.</p>
          </div>
          </section>
          <NutritionTab meals={meals} onSaveMeals={saveMeals} targets={nutritionTargets} onSaveTargets={saveTargets} water={waterLog[TODAY]} />
        </ProTabGate>
      ))}
      {S.add('care', () => (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
          <CareTab vitals={vitals} onSaveVitals={saveVitals} appts={appts} onSaveAppts={saveAppts} labs={labs} onSaveLabs={saveLabs} onAddEvent={onAddEvent} />
        </ProTabGate>
      ))}

      {S.add('mood', () => (
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
                  <div style={{fontSize:'.58rem',fontWeight:600,color:todayWellness.mood===m.value?'var(--brass-fg)':'var(--muted)'}}>{m.label}</div>
                </button>
              ))}
            </div>
            {todayWellness.mood && (
              <div style={{padding:'10px 12px',background:'var(--brass-dim)',borderRadius:'var(--radius-sm)',fontSize:'.82rem',color:'var(--brass-fg)',textAlign:'center'}}>
                {todayWellness.mood >= 4 ? '✦ Carry that energy forward today.' : todayWellness.mood >= 3 ? "✦ That's okay. One step at a time." : '✦ Reach out to someone. You matter.'}
              </div>
            )}
          </section>

          <section className="card">
            <p className="eyebrow">Energy & Readiness</p>
            {recovery[TODAY] ? (
              <button className={'readiness-hero compact tone-' + (readinessBand(readinessOf(recovery[TODAY]))?.tone || 'mid')} onClick={() => setTab('recovery')} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit' }}>
                <div className="readiness-num">{readinessOf(recovery[TODAY])}</div>
                <div><strong>Energy {recovery[TODAY].energy}/5 · {readinessBand(readinessOf(recovery[TODAY])).label}</strong><p>From today's check-in. Tap to update.</p></div>
              </button>
            ) : (
              <button className="readiness-cta" onClick={() => setTab('recovery')} style={{ width: '100%', border: 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}>
                <Gauge size={20} />
                <div><strong>Rate your energy</strong><span>Part of the 20-second daily check-in</span></div>
                <span aria-hidden="true">→</span>
              </button>
            )}
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
      ))}

      {/* ── Sleep ────────────────────────────────────────────────── */}
      {/* ── Journal ──────────────────────────────────────────────── */}
      {S.add('journal', () => (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <div>
          <section className="card">
            <p className="eyebrow">Reflection</p>
            <h3 style={{margin:'4px 0 10px'}}>Today's Entry</h3>
            <div style={{padding:'10px 12px',background:'var(--brass-dim)',borderRadius:'var(--radius-sm)',marginBottom:12,cursor:'pointer'}}
              onClick={() => setJournalPrompt((journalPrompt+1)%JOURNAL_PROMPTS.length)}>
              <div style={{fontSize:'.65rem',fontWeight:700,color:'var(--brass-fg)',letterSpacing:'.08em',marginBottom:3}}>TODAY'S PROMPT — TAP TO CHANGE</div>
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
          {journalEntries.slice(0, journalShown).map(entry => (
            <section key={entry.id} className="card">
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                <div style={{fontSize:'.65rem',fontWeight:700,color:'var(--brass-fg)',letterSpacing:'.08em',textTransform:'uppercase'}}>{entry.date ? formatDateLabel(entry.date, { weekday: 'short', month: 'short', day: 'numeric', year: entry.date.slice(0, 4) !== TODAY.slice(0, 4) ? 'numeric' : undefined }) : ''}</div>
                <button aria-label="Delete entry" onClick={()=>{ if (window.confirm('Delete this journal entry?')) saveJournal(journalEntries.filter(e=>e.id!==entry.id)) }}
                  style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:'.85rem'}}>✕</button>
              </div>
              {entry.prompt && <div style={{fontSize:'.75rem',color:'var(--muted)',fontStyle:'italic',marginBottom:6}}>{entry.prompt}</div>}
              <p style={{fontSize:'.88rem',color:'var(--ink2)',lineHeight:1.7,fontFamily:'var(--serif)',whiteSpace:'pre-wrap'}}>{entry.text}</p>
            </section>
          ))}
          {journalEntries.length > journalShown && (
            <button className="secondary-btn" style={{width:'100%'}} onClick={() => setJournalShown((n) => n + 10)}>Show older entries ({journalEntries.length - journalShown} more)</button>
          )}
        </div>
      </ProTabGate>))}

      {/* ── Routine ──────────────────────────────────────────────── */}
      {S.add('routine', () => (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <section className="card">
          <p className="eyebrow">Daily Routine Builder</p>
          <h3 style={{margin:'4px 0 14px'}}>Your Rhythm</h3>
          {routine.length === 0 && <p className="muted" style={{fontSize:'.85rem',marginBottom:12}}>Build your morning and evening rhythm below.</p>}
          {[...routine].sort((a, b) => ({ morning: 0, anytime: 1, evening: 2 }[a.type] ?? 1) - ({ morning: 0, anytime: 1, evening: 2 }[b.type] ?? 1)).map(item => {
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
                  <div style={{fontSize:'.72rem',color:'var(--muted)',textTransform:'capitalize'}}>{[item.time, item.type].filter(Boolean).join(' · ')}</div>
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
      </ProTabGate>))}

      {/* ── Reading ──────────────────────────────────────────────── */}

      {S.add('meds', () => (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <>
          <section className="card">
            <p className="eyebrow">Today's Medications</p>
            <h3 style={{ margin: '4px 0 14px' }}>Medication Log — {formatDateLabel(TODAY, { weekday: 'long', month: 'short', day: 'numeric' })}</h3>
            {meds.map((med, i) => {
              // Taken-today key: the med's id (older meds without one keep their name_index key)
              const medKey = med.id ? `id:${med.id}` : `${med.name}_${i}`
              const taken = todayMeds.includes(medKey)
              // Days are saved as Mon/Tue/…; this compared against "Friday" before, so day-scheduled meds never showed as due
              const todayDay = formatDateLabel(TODAY, { weekday: 'short' })
              const isScheduled = !med.days || med.days.length === 0 || med.days.includes(todayDay)
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--surface)' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '.9rem', color: taken ? 'var(--muted)' : 'var(--text)', textDecoration: taken ? 'line-through' : 'none' }}>{med.name}</div>
                    <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>{[med.dose, med.time, med.type, med.days?.length ? med.days.join(' ') : ''].filter(Boolean).join(' · ')}</div>
                  </div>
                  {isScheduled ? (
                  <button onClick={() => saveMedLog({ ...medLog, [todayMedKey]: taken ? todayMeds.filter(n => n !== medKey) : [...todayMeds, medKey] })}
                    style={{ padding: '6px 14px', borderRadius: 999, border: '1.5px solid', cursor: 'pointer', fontSize: '.82rem', fontWeight: 700, fontFamily: 'inherit',
                      borderColor: taken ? 'var(--success)' : 'var(--teal)',
                      background: taken ? 'rgba(34,197,94,.1)' : 'var(--teal)',
                      color: taken ? 'var(--success)' : 'var(--navy)' }}>
                    {taken ? '✓ Taken' : 'Take'}
                  </button>
                  ) : (
                  <span style={{fontSize:'.75rem',color:'var(--muted)',fontStyle:'italic'}}>Not scheduled today</span>
                  )}
                </div>
              )
            })}
            {meds.length === 0 && <p className="muted" style={{fontSize:'.85rem'}}><EmptyState icon="💊" title="No medications added" message="Track supplements or medications you take daily." /></p>}
          </section>
          <section className="card">
            <p className="eyebrow">Medication Summary</p>
            <h3 style={{ margin: '4px 0 12px' }}>Add Medication / Supplement</h3>
            <div style={{ display: 'grid', gap: 8 }}>
              {[['Name', 'medName', 'text', 'e.g. Vitamin D, Metformin'], ['Dose', 'medDose', 'text', 'e.g. 500mg'], ['Time', 'medTime', 'text', 'e.g. Morning, With food']].map(([lbl, key, type, ph]) => (
                <input key={key} type={type} placeholder={`${lbl} — ${ph}`} value={form[key] || ''} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                  style={{ padding: '9px 12px', border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', fontSize: '.85rem' }} />
              ))}
              {/* Days of week selector */}
              <div>
                <p style={{fontSize:'.78rem',color:'var(--ink2)',marginBottom:6,fontWeight:600}}>Scheduled Days (leave blank for daily)</p>
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                  {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day => {
                    const sel = (form.medDays||[]).includes(day)
                    return (
                      <button key={day} type="button" onClick={() => setForm(p => ({
                        ...p, medDays: sel ? (p.medDays||[]).filter(d=>d!==day) : [...(p.medDays||[]), day]
                      }))} style={{
                        padding:'5px 10px', borderRadius:999, fontSize:'.75rem', fontWeight:600,
                        border:'1.5px solid', cursor:'pointer',
                        borderColor: sel ? 'var(--teal)' : 'var(--border2)',
                        background: sel ? 'var(--teal)' : 'transparent',
                        color: sel ? 'white' : 'var(--ink2)',
                      }}>{day}</button>
                    )
                  })}
                </div>
              </div>
              <button className="primary-btn" onClick={() => {
                if(!form.medName) return
                const DAY_ORDER = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
                saveMeds([...meds, {id: Date.now(), name:form.medName.trim(), dose:form.medDose||'', time:form.medTime||'', days:(form.medDays||[]).slice().sort((a,b)=>DAY_ORDER.indexOf(a)-DAY_ORDER.indexOf(b)), notes:form.medNotes||''}])
                setForm(p => ({...p, medName:'', medDose:'', medTime:'', medNotes:'', medDays:[]}))
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
                      {med.type && <span style={{ fontSize: '.72rem', padding: '2px 8px', borderRadius: 999, background: 'var(--teal-dim)', color: 'var(--teal)' }}>{med.type}</span>}
                      <button aria-label={`Remove ${med.name}`} onClick={() => { if (window.confirm(`Remove ${med.name}?`)) saveMeds(meds.filter((_, j) => j !== i)) }} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      </ProTabGate>))}

      {S.add('sleep', () => (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <section className="card">
          <p className="eyebrow">Sleep Tracker</p>
          <h3 style={{ margin: '4px 0 12px' }}>Sleep Log</h3>

          {/* Quick Sleep Quality */}
          <div style={{marginBottom:16}}>
            <p style={{fontSize:'.72rem',color:'var(--ink2)',fontWeight:600,letterSpacing:'.06em',textTransform:'uppercase',marginBottom:8}}>How did you sleep?</p>
            <div style={{display:'grid',gridTemplateColumns:'repeat(5, 1fr)',gap:6}}>
              {[
                {icon:'😴', label:'Great', val:5},
                {icon:'🙂', label:'Good', val:4},
                {icon:'😐', label:'OK', val:3},
                {icon:'😕', label:'Poor', val:2},
                {icon:'😩', label:'Awful', val:1},
              ].map(({icon, label, val}) => {
                // Sets the 1–10 quality below (Great = 10 … Awful = 2) and today's mood check-in sleep rating
                const on = form.sleepQ ? Math.round(form.sleepQ / 2) === val : todayWellness.sleep === val
                return (
                <button key={label} aria-pressed={on} onClick={() => {
                  logWellness('sleep', val)
                  setForm(p => ({ ...p, sleepQ: val * 2 }))
                }} style={{
                  display:'flex', flexDirection:'column', alignItems:'center', gap:3,
                  padding:'10px 4px', borderRadius:10, background: on ? 'var(--teal-dim)' : 'var(--stone)',
                  border: on ? '1.5px solid var(--teal)' : '1.5px solid var(--border2)', cursor:'pointer',
                }}
                >
                  <div style={{fontSize:'1.5rem'}}>{icon}</div>
                  <div style={{fontSize:'.65rem',color:'var(--ink2)',fontWeight:600}}>{label}</div>
                </button>
                )
              })}
            </div>
          </div>
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
            {(() => {
              const span = sleepSpan(form.sleepBed, form.sleepWake)
              if (!span) return null
              return (
                <div className={'sleep-preview' + (span.fixed ? ' fixed' : '')}>
                  <strong>{fmtHours(span.hours)} of sleep</strong>
                  <span>{fmt12(span.bed)} → {fmt12(span.wake)}{span.fixed ? ` · ${span.fixed === 'bed' ? 'bedtime switched to PM' : 'wake time switched to AM'}` : ''}</span>
                </div>
              )
            })()}
            <input placeholder="Notes (dreams, woke up, restless...)" value={form.sleepNote || ''} onChange={e => setForm(p => ({ ...p, sleepNote: e.target.value }))}
              style={{ padding: '9px 12px', border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', fontSize: '.85rem' }} />
            {sleep.some((e) => e.date === TODAY) && <small className="muted">Logging again replaces last night's entry.</small>}
            <button className="primary-btn" onClick={() => {
              const span = sleepSpan(form.sleepBed, form.sleepWake)
              const entry = { date: TODAY, bed: span ? span.bed : (form.sleepBed || ''), wake: span ? span.wake : (form.sleepWake || ''), hours: span ? span.hours : '', quality: form.sleepQ || 5, notes: form.sleepNote || '' }
              saveSleep([entry, ...sleep.filter((e) => e.date !== TODAY)].slice(0, 60))
              setForm(p => ({ ...p, sleepBed: '', sleepWake: '', sleepQ: 5, sleepNote: '' }))
            }}>Log Sleep</button>
          </div>
          {sleep.slice(0, 7).map((entry, i) => {
            const span = sleepSpan(entry.bed, entry.wake)
            const line = [span ? `${fmt12(span.bed)} → ${fmt12(span.wake)} · ${fmtHours(span.hours)}` : '', entry.notes || ''].filter(Boolean).join(' · ')
            return (
            <div key={entry.date + '-' + i} className="metric-row card-row">
              <div>
                <div style={{ fontWeight: 600, fontSize: '.88rem' }}>{formatDateLabel(entry.date, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                {line && <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>{line}</div>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: entry.quality >= 7 ? 'rgba(34,197,94,.15)' : entry.quality >= 5 ? 'rgba(240,180,41,.15)' : 'rgba(232,85,85,.15)', display: 'grid', placeItems: 'center' }}>
                  <span style={{ fontSize: '.82rem', fontWeight: 700, color: entry.quality >= 7 ? 'var(--success)' : entry.quality >= 5 ? 'var(--warning)' : 'var(--danger)' }}>{entry.quality}</span>
                </div>
              </div>
            </div>
            )
          })}
        </section>
      </ProTabGate>))}

      {S.add('anxiety', () => (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
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
      </ProTabGate>))}

      {S.add('migraines', () => (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
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
      </ProTabGate>))}

      {S.add('coping', () => (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <section className="card">
          <p className="eyebrow">Coping Skills</p>
          <h3 style={{margin:'4px 0 12px'}}>Your Toolkit</h3>
          {Object.entries(COPING_SKILLS).map(([category, skills]) => (
            <div key={category} style={{marginBottom:18}}>
              <div style={{fontSize:'.7rem', fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', color:'var(--brass-fg)', marginBottom:8}}>{category}</div>
              <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
                {skills.map(skill => {
                  const used = todayCopingUsed.includes(skill)
                  return (
                    <button key={skill} onClick={() => {
                      const next = used
                        ? todayCopingUsed.filter(s => s !== skill)
                        : [...todayCopingUsed, skill]
                      saveCopingUsed({...copingUsed, [todayCopingKey]: next})
                    }} style={{
                      padding:'6px 12px', borderRadius:999, cursor:'pointer',
                      border: used ? '1.5px solid var(--teal)' : '1.5px solid var(--border2)',
                      background: used ? 'var(--teal)' : 'var(--stone)',
                      color: used ? 'white' : 'var(--ink2)',
                      fontSize:'.78rem', fontWeight:500,
                      transition:'all .15s',
                    }}>{used ? '✓ ' : ''}{skill}</button>
                  )
                })}
              </div>
            </div>
          ))}
          <div style={{marginTop:8, padding:'10px 12px', background:'var(--teal-dim)', borderRadius:'var(--radius-sm)', fontSize:'.78rem', color:'var(--text2)', lineHeight:1.6}}>
            💡 These are tools — use what works for you in the moment.
          </div>
          {todayCopingUsed.length > 0 && (
            <div style={{marginTop:10,padding:'10px 12px',background:'var(--stone)',borderRadius:'var(--radius-sm)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontSize:'.82rem',color:'var(--ink2)'}}>✓ Used {todayCopingUsed.length} skill{todayCopingUsed.length > 1 ? 's' : ''} today</span>
              <button onClick={() => {
                todayCopingUsed.forEach(skill => {
                  saveItem('task', {
                    title: `Coping: ${skill}`,
                    category: 'Wellness',
                    date: TODAY,
                    completed: true,
                    completedAt: new Date().toISOString(),
                  }, 'create')
                })
              }} style={{
                padding:'6px 14px', borderRadius:999, fontSize:'.78rem', fontWeight:600,
                background:'var(--teal)', color:'white', border:'none', cursor:'pointer',
              }}>Log as Tasks</button>
            </div>
          )}
        </section>
      </ProTabGate>))}

      {S.add('metrics', () => (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <div>
          <section className="card">
          {/* Body Measurements */}
          <div style={{marginBottom:18}}>
            <p style={{fontSize:'.72rem',color:'var(--ink2)',fontWeight:600,letterSpacing:'.06em',textTransform:'uppercase',marginBottom:8}}>📏 Body Measurements</p>
            
            {/* Latest snapshot */}
            {measurements.length > 0 && (() => {
              const latest = measurements[measurements.length-1]
              const prev = measurements[measurements.length-2]
              return (
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:6,marginBottom:10}}>
                  {[
                    ['Weight', latest.weight, prev?.weight, 'lbs'],
                    ['Waist', latest.waist, prev?.waist, 'in'],
                    ['Hip', latest.hip, prev?.hip, 'in'],
                    ['Body Fat', latest.bodyFat, prev?.bodyFat, '%'],
                  ].map(([label, val, prevVal, unit]) => {
                    if (!val) return null
                    const delta = prevVal ? Number(val) - Number(prevVal) : 0
                    return (
                      <div key={label} style={{background:'var(--stone)',borderRadius:8,padding:'8px 4px',textAlign:'center'}}>
                        <div className="muted" style={{fontSize:'.62rem',fontWeight:600,marginBottom:2}}>{label}</div>
                        <strong style={{fontSize:'.92rem',color:'var(--ink)'}}>{val}<span style={{fontSize:'.65rem',color:'var(--muted)'}}>{unit}</span></strong>
                        {delta !== 0 && (
                          <div style={{fontSize:'.65rem',color: delta > 0 ? 'var(--danger)' : 'var(--success)',marginTop:2}}>
                            {delta > 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })()}

            {/* Form */}
            <div style={{background:'var(--stone)',borderRadius:10,padding:12,display:'grid',gap:8}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:6}}>
                <input type="number" placeholder="Weight" value={newMeasurement.weight}
                  onChange={e => setNewMeasurement(p => ({...p, weight: e.target.value}))}
                  style={{padding:'8px',border:'1.5px solid var(--border2)',borderRadius:6,fontSize:'.82rem'}} />
                <input type="number" placeholder="Waist" value={newMeasurement.waist}
                  onChange={e => setNewMeasurement(p => ({...p, waist: e.target.value}))}
                  style={{padding:'8px',border:'1.5px solid var(--border2)',borderRadius:6,fontSize:'.82rem'}} />
                <input type="number" placeholder="Hip" value={newMeasurement.hip}
                  onChange={e => setNewMeasurement(p => ({...p, hip: e.target.value}))}
                  style={{padding:'8px',border:'1.5px solid var(--border2)',borderRadius:6,fontSize:'.82rem'}} />
                <input type="number" placeholder="BF%" value={newMeasurement.bodyFat}
                  onChange={e => setNewMeasurement(p => ({...p, bodyFat: e.target.value}))}
                  style={{padding:'8px',border:'1.5px solid var(--border2)',borderRadius:6,fontSize:'.82rem'}} />
              </div>
              <button onClick={() => {
                if(!newMeasurement.weight && !newMeasurement.waist && !newMeasurement.hip && !newMeasurement.bodyFat) return
                saveMeasurements([...measurements, {...newMeasurement, id: Date.now()}])
                setNewMeasurement({weight:'', waist:'', hip:'', bodyFat:'', date:TODAY})
              }} style={{padding:'9px',background:'var(--teal)',color:'white',border:'none',borderRadius:8,fontWeight:600,cursor:'pointer',fontSize:'.85rem'}}>
                + Log Measurement
              </button>
            </div>
          </div>

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
                    <div style={{fontSize:'.75rem',fontWeight:700,color:'var(--brass-fg)'}}>{entry.date}</div>
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
      </ProTabGate>))}

      <SectionRows sections={S} tabs={WELLNESS_GROUPS.flatMap((g) => g.ids).map((id) => TABS.find((t) => t.id === id)).filter(Boolean)} primary="mood" tab={tab} onSelect={setTab} subs={SECTION_SUBS} proTabs={PRO_TABS.wellness} isPro={isPro} />
    </div>
  )
}

export { HealthWellnessPage }

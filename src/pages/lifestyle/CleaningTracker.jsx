// Lifestyle: cleaning tracker.
import { useState } from 'react'
import { TODAY, addDays, startOfWeek } from '../../lib/dates.js'
import { usePageKey } from '../../lib/pageData.js'

// ── LIFESTYLE PAGE ─────────────────────────────────────────────────────────
// Home cleaning tracker — lives in Lifestyle; data stays under page 'productivity'.
function CleaningTracker() {
  const [cleaningLog, saveCleaningLog2] = usePageKey('productivity', 'cleaningLog', {}, ['planner.p.cleaningLog', 'planner.p.cleaning_log_v2', 'cleaningLog'])
  const [cleaningFreq, setCleaningFreq] = useState('daily')
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
  // Each check-off belongs to its period, so lists reset on their own: daily each day, weekly each week, etc.
  // (Before 2026-11-13 keys had no date and stayed checked forever.)
  const periodOf = (freq) => {
    if (freq === 'daily') return 'd:' + TODAY
    if (freq === 'weekly') return 'w:' + startOfWeek(TODAY)
    if (freq === 'monthly') return 'm:' + TODAY.slice(0, 7)
    if (freq === 'quarterly') return 'q:' + TODAY.slice(0, 4) + '-Q' + (Math.floor((Number(TODAY.slice(5, 7)) - 1) / 3) + 1)
    return 'y:' + TODAY.slice(0, 4)
  }
  const ck = (freq, task) => periodOf(freq) + '_' + task
  // Keep 60 days of daily history (for streaks and scores); drop old undated keys
  const saveClean = (log) => {
    const cutoff = 'd:' + addDays(TODAY, -60)
    saveCleaningLog2(Object.fromEntries(Object.entries(log).filter(([k, v]) => v && /^[dwmqy]:/.test(k) && !(k.startsWith('d:') && k.slice(0, 12) < cutoff))))
  }
  return (
        <div>
          <section className="card" style={{padding:'12px 14px'}}>
            <p className="eyebrow">Home Cleaning Tracker</p>
            <h3 style={{margin:'4px 0 10px'}}>Keeping a Clean Home</h3>
            <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
              {Object.keys(CLEANING_SCHEDULE).map(freq => {
                const tasks = CLEANING_SCHEDULE[freq]
                const done = tasks.filter(t => cleaningLog[ck(freq, t)])
                return (
                  <button key={freq} onClick={() => setCleaningFreq(freq)} style={{
                    padding:'6px 12px',borderRadius:999,border:'1.5px solid',fontSize:'.78rem',
                    cursor:'pointer',fontFamily:'var(--sans)',fontWeight:600,
                    borderColor: cleaningFreq===freq ? 'var(--brass)' : 'var(--border2)',
                    background: cleaningFreq===freq ? 'var(--brass-dim)' : 'transparent',
                    color: cleaningFreq===freq ? 'var(--brass-fg)' : 'var(--muted)',
                    position:'relative'
                  }}>
                    {FREQ_LABELS[freq]}
                    {done.length > 0 && (
                      <span style={{marginLeft:4,fontSize:'.65rem',color:cleaningFreq===freq?'var(--brass-fg)':'var(--success)',fontWeight:700}}>
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
                  {CLEANING_SCHEDULE[cleaningFreq].filter(t => cleaningLog[ck(cleaningFreq, t)]).length} of {CLEANING_SCHEDULE[cleaningFreq].length} done
                </h3>
              </div>
              <button onClick={() => {
                const tasks = CLEANING_SCHEDULE[cleaningFreq]
                const allDone = tasks.every(t => cleaningLog[ck(cleaningFreq, t)])
                const updated = {...cleaningLog}
                tasks.forEach(t => { allDone ? delete updated[ck(cleaningFreq, t)] : (updated[ck(cleaningFreq, t)] = true) })
                saveClean(updated)
              }} className="ghost-btn" style={{fontSize:'.75rem',padding:'5px 10px'}}>
                {CLEANING_SCHEDULE[cleaningFreq].every(t => cleaningLog[ck(cleaningFreq, t)]) ? 'Uncheck All' : 'Check All'}
              </button>
            </div>

            {CLEANING_SCHEDULE[cleaningFreq].map(task => {
              const key = ck(cleaningFreq, task)
              const done = !!cleaningLog[key]
              return (
                <div key={task} onClick={() => {
                  const updated = {...cleaningLog}
                  done ? delete updated[key] : (updated[key] = true)
                  saveClean(updated)
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

            {CLEANING_SCHEDULE[cleaningFreq].filter(t => cleaningLog[ck(cleaningFreq, t)]).length === CLEANING_SCHEDULE[cleaningFreq].length && (
              <div style={{marginTop:12,padding:'10px 14px',background:'rgba(52,168,83,.08)',borderRadius:'var(--radius-sm)',textAlign:'center',fontSize:'.85rem',color:'var(--success)',fontWeight:600}}>
                ✓ All {FREQ_LABELS[cleaningFreq].toLowerCase()} tasks complete!
              </div>
            )}
          </section>
        </div>
  )
}

export { CleaningTracker }

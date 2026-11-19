// Settings (More) page.
import React from 'react'
import Reviews from "../../Reviews"
import AccountPrivacy from '../../AccountPrivacy.jsx'
import ScriptureCredits from '../../ScriptureCredits.jsx'
import { isNative, purchasesInApp, NATIVE_PURCHASES, storeRestore, storeManage } from '../../native.js'
import { hasSupabaseEnv, supabase } from '../../lib/supabase.js'
import { DEVICE_TIME_ZONE } from '../../lib/dates.js'
import { FREE_LIMITS } from '../../lib/subscription.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { PLANNER_MODES, modeOf } from '../../shell/nav.js'
import { PageNav } from '../../components/PageNav.jsx'
import { A2HSModal } from '../../components/A2HS.jsx'
import { NotificationSettings } from './NotificationSettings.jsx'
import { BackupButton } from './Backup.jsx'
import { CalendarSettings } from './CalendarSettings.jsx'

const PLANNER_SETTINGS_THEME = {
  text: 'var(--ink)', muted: 'var(--muted)', card: 'var(--surface)', border: 'var(--border2)',
  danger: '#9B2C2C', dangerF: 'rgba(155,44,44,.08)', dangerB: 'rgba(155,44,44,.35)', dark: false,
  body: 'var(--sans)', heading: 'var(--sans)',
}

const TIME_ZONES = [
  ['America/New_York', 'Eastern (New York)'], ['America/Chicago', 'Central (Chicago)'], ['America/Denver', 'Mountain (Denver)'],
  ['America/Phoenix', 'Arizona (Phoenix)'], ['America/Los_Angeles', 'Pacific (Los Angeles)'], ['America/Anchorage', 'Alaska (Anchorage)'],
  ['Pacific/Honolulu', 'Hawaii (Honolulu)'], ['America/Puerto_Rico', 'Atlantic (Puerto Rico)'], ['America/Toronto', 'Eastern (Toronto)'],
  ['America/Mexico_City', 'Mexico City'], ['Europe/London', 'London'], ['Europe/Paris', 'Central Europe (Paris)'], ['Africa/Lagos', 'West Africa (Lagos)'],
  ['Africa/Johannesburg', 'South Africa (Johannesburg)'], ['Asia/Dubai', 'Dubai'], ['Asia/Kolkata', 'India (Kolkata)'], ['Asia/Manila', 'Philippines (Manila)'],
  ['Asia/Tokyo', 'Japan (Tokyo)'], ['Australia/Sydney', 'Sydney'],
]
// One Settings row: an emoji, a name and a line of what is inside; the block opens under it.
function Fold({ id, emoji, title, sub, children }) {
  return (
    <details className="fold-row" id={id}>
      <summary>
        <span className="fold-emoji" aria-hidden="true">{emoji}</span>
        <span className="fold-text"><span className="fold-label">{title}</span>{sub && <span className="fold-sub">{sub}</span>}</span>
        <span aria-hidden="true" className="fold-caret">▾</span>
      </summary>
      <div className="fold-body">{children}</div>
    </details>
  )
}

function MorePage({ profile, settings, updateProfile, updateSettings, onEdit, onDelete, onQuickCreate , triggerUpgrade}) {
  const { signOut, user } = useAuth()
  const [nameDraft, setNameDraft] = React.useState(profile.displayName || '')
  React.useEffect(() => { setNameDraft(profile.displayName || '') }, [profile.displayName])
  const [a2hsOpen, setA2hsOpen] = React.useState(false)
  const [showReviews, setShowReviews] = React.useState(false)
  // App Store app: is this account's Pro an Apple subscription? (then Manage opens Apple's subscriptions)
  const [appleSub, setAppleSub] = React.useState(false)
  const [restoreMsg, setRestoreMsg] = React.useState('')
  React.useEffect(() => {
    if (!isNative || !user || !hasSupabaseEnv) return
    let alive = true
    supabase.from('app_store_entitlements').select('active, expires_at').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => { if (alive) setAppleSub(!!data?.active && (!data.expires_at || new Date(data.expires_at) > new Date())) })
    return () => { alive = false }
  }, [user?.id])

  // /more#reminders (or any row's id, or an id inside a row) opens that row and brings it into view.
  React.useEffect(() => {
    const id = (window.location.hash || '').slice(1)
    if (!id) return
    const t = setTimeout(() => {
      const el = document.getElementById(id)
      const row = el && el.closest('details.fold-row')
      if (row) { row.open = true; row.scrollIntoView({ block: 'start' }) }
    }, 60)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="screen-stack">
        <section className="card">
          <p className="eyebrow">Subscription</p>
          {(() => {
            const tier = (typeof window !== 'undefined' && localStorage.getItem('planner_tier')) || 'free'
            const isPro = tier === 'pro' || tier === 'trial'
            return (
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:8,gap:12}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:'1rem',color:'var(--ink)'}}>The Living Planner {isPro ? 'Pro ✓' : ''}</div>
                  <div style={{fontSize:'.82rem',color:'var(--ink2)',marginTop:2}}>
                    {isPro ? 'All features unlocked · Thanks for supporting' : `Free plan · ${FREE_LIMITS.habits} habits, ${FREE_LIMITS.goals} goals, ${FREE_LIMITS.projects} projects`}
                  </div>
                </div>
                {isPro && appleSub ? (
                  <button type="button" onClick={storeManage}
                     style={{
                       padding:'8px 18px', borderRadius:999, background:'var(--stone)',
                       color:'var(--ink)', border:'1.5px solid var(--border2)',
                       fontWeight:600, fontSize:'.82rem', whiteSpace:'nowrap', cursor:'pointer',
                     }}>Manage</button>
                ) : isPro ? (
                  <a href="mailto:support@eloraradiance.com?subject=Manage%20My%20Subscription"
                     style={{
                       padding:'8px 18px', borderRadius:999, background:'var(--stone)',
                       color:'var(--ink)', textDecoration:'none', border:'1.5px solid var(--border2)',
                       fontWeight:600, fontSize:'.82rem', whiteSpace:'nowrap',
                     }}>Manage</a>
                ) : purchasesInApp && (
                  <button onClick={() => triggerUpgrade('Upgrade to Pro', 'The whole planner, with no limits.')} style={{
                    padding:'8px 18px', borderRadius:999, background:'var(--teal)',
                    color:'white', border:'none', fontWeight:700, fontSize:'.85rem', cursor:'pointer',
                  }}>Upgrade</button>
                )}
              </div>
            )
          })()}
          {appleSub ? (
            <p className="muted" style={{fontSize:'.72rem',marginTop:12,marginBottom:0,lineHeight:1.5}}>
              Your Pro subscription is through the App Store. Change or cancel it with Manage (your Apple ID's subscriptions).
              You keep Pro until the end of the period you've paid for.
            </p>
          ) : (purchasesInApp || ['pro', 'trial'].includes((typeof window !== 'undefined' && localStorage.getItem('planner_tier')) || '')) &&
          <p className="muted" style={{fontSize:'.72rem',marginTop:12,marginBottom:0,lineHeight:1.5}}>
            {isNative && NATIVE_PURCHASES
              ? <>Pro bought in this app is managed in your Apple ID's subscriptions. If you subscribed on the website, email{' '}<a href="mailto:support@eloraradiance.com" style={{color:'var(--teal)'}}>support@eloraradiance.com</a> to make changes.</>
              : <>To cancel or update payment, email{' '}<a href="mailto:support@eloraradiance.com" style={{color:'var(--teal)'}}>support@eloraradiance.com</a>. You keep Pro until the end of the period you've paid for.</>}
          </p>}
          {isNative && NATIVE_PURCHASES && !['pro', 'trial'].includes((typeof window !== 'undefined' && localStorage.getItem('planner_tier')) || '') && (
            <button type="button" onClick={async () => {
              setRestoreMsg('Checking your Apple ID…')
              const ok = await storeRestore(user?.id)
              if (ok) { window.dispatchEvent(new CustomEvent('planner-store-purchased')); setRestoreMsg('') }
              else setRestoreMsg('No Living Planner Pro subscription was found for this Apple ID.')
            }} style={{background:'none',border:'none',color:'var(--teal)',fontWeight:700,fontSize:'.8rem',padding:'10px 0 0',cursor:'pointer'}}>
              Restore purchases
            </button>
          )}
          {restoreMsg && <p role="status" className="muted" style={{fontSize:'.75rem',margin:'6px 0 0'}}>{restoreMsg}</p>}
        </section>

      <div style={{display:"flex",alignItems:"center",gap:8,paddingBottom:2}}>
        <span style={{fontSize:"1.1rem"}}>⚙</span>
        <p style={{fontSize:".62rem",fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:'var(--brass-fg)',margin:0}}>Settings</p>
      </div>

      {/* Settings blocks fold into rows (2026-11-18): the page was six screens long. Each row opens in place;
          /more#<id> opens that row (for example /more#apple-calendar). Tests open every row with openFolds(). */}
      <div className="fold-list">
      <Fold id="profile" emoji="👤" title="Profile" sub="Your name and time zone">
      <section className="card">
        <div className="section-title-row" style={{marginBottom:14}}>
          <div><p className="eyebrow">Account</p><h3>Profile</h3></div>
        </div>
        <div style={{display:'grid', gap:12}}>
          {/* Name saves when you finish typing (was one save per letter) */}
          <label style={{display:'grid', gap:5, fontSize:'.85rem', fontWeight:600, color:'var(--text2)'}}>
            Display Name
            <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => { const v = nameDraft.trim(); if (v !== (profile.displayName || '')) updateProfile({ ...profile, displayName: v }) }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
              style={{padding:'10px 12px', border:'1.5px solid var(--border2)', borderRadius:'var(--radius-sm)', fontSize:'.9rem', color:'var(--text)', background:'var(--surface)'}} />
          </label>
          {/* Reminders are sent on this time zone's clock, so it's a list of real zones (free text could break them) */}
          <label style={{display:'grid', gap:5, fontSize:'.85rem', fontWeight:600, color:'var(--text2)'}}>
            Time zone
            <select value={profile.timezone || DEVICE_TIME_ZONE || 'America/Chicago'} onChange={(e) => updateProfile({ ...profile, timezone: e.target.value })}
              style={{padding:'10px 12px', border:'1.5px solid var(--border2)', borderRadius:'var(--radius-sm)', fontSize:'.9rem', color:'var(--text)', background:'var(--surface)'}}>
              {[...new Set([profile.timezone, DEVICE_TIME_ZONE, ...TIME_ZONES.map(([z]) => z)].filter(Boolean))].map((z) => (
                <option key={z} value={z}>{(TIME_ZONES.find(([x]) => x === z) || [z, z.replace(/_/g, ' ')])[1]}{z === DEVICE_TIME_ZONE ? ' · this device' : ''}</option>
              ))}
            </select>
            {DEVICE_TIME_ZONE && profile.timezone && profile.timezone !== DEVICE_TIME_ZONE && (
              <span style={{fontSize:'.76rem', fontWeight:400, color:'var(--muted)', lineHeight:1.45}}>
                This device is on {DEVICE_TIME_ZONE.replace(/_/g, ' ')}. Reminders follow the zone above.{' '}
                <button type="button" onClick={() => updateProfile({ ...profile, timezone: DEVICE_TIME_ZONE })} style={{background:'none', border:'none', padding:0, color:'var(--teal)', fontWeight:600, cursor:'pointer', font:'inherit'}}>Use this device's</button>
              </span>
            )}
          </label>
          <label style={{display:'grid', gap:5, fontSize:'.85rem', fontWeight:600, color:'var(--text2)'}}>
            Planner Mode
            <select value={profile.plannerMode || 'Balanced'} onChange={(e) => updateProfile({ ...profile, plannerMode: e.target.value })}
              style={{padding:'10px 12px', border:'1.5px solid var(--border2)', borderRadius:'var(--radius-sm)', fontSize:'.9rem', color:'var(--text)', background:'var(--surface)'}}>
              {PLANNER_MODES.map((m) => <option key={m.id}>{m.id}</option>)}
            </select>
            <span style={{fontSize:'.76rem', fontWeight:400, color:'var(--muted)', lineHeight:1.45}}>{modeOf(profile).line}</span>
          </label>
        </div>
      </section>
      </Fold>

      <Fold id="preferences" emoji="⚙️" title="Preferences" sub="Completed tasks and calendar density">
      <section className="card">
        <div className="section-title-row" style={{marginBottom:12}}>
          <div><p className="eyebrow">Preferences</p><h3>Settings</h3></div>
        </div>
        {[
          ['Show completed tasks', 'showCompletedTasks'],
          ['Compact calendar', 'compactCalendar'],
        ].map(([label, key]) => (
          <div key={key} className="setting-row">
            <span style={{fontSize:'.9rem', color:'var(--text2)'}}>{label}</span>
            <input type="checkbox" checked={settings[key]} onChange={(e) => updateSettings({ ...settings, [key]: e.target.checked })} />
          </div>
        ))}
      </section>
      </Fold>

      <Fold id="reminders" emoji="🔔" title="Reminders" sub="Notifications for tasks, events and habits">
      <NotificationSettings settings={settings} updateSettings={updateSettings} />
      </Fold>

      {isNative && (<Fold id="apple-calendar-row" emoji="📅" title="Apple Calendar" sub="Show your calendars beside your tasks">
      <CalendarSettings />
      </Fold>)}

      <Fold id="data" emoji="☁️" title="Data & Sync" sub="Backup and your devices">
      <section className="card">
        <p className="eyebrow">Data & Sync</p>
        <h3 style={{margin:'4px 0 14px'}}>Cross-Device Sync</h3>
        <div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',borderRadius:'var(--radius-sm)',background:'var(--surface)',marginBottom:12}}>
          <div style={{width:12,height:12,borderRadius:'50%',background:hasSupabaseEnv?'var(--success)':'var(--warning)',flexShrink:0,boxShadow:hasSupabaseEnv?'0 0 8px var(--success)':undefined}} />
          <div>
            <div style={{fontWeight:600,fontSize:'.9rem'}}>{hasSupabaseEnv ? '✓ Connected — syncing across all devices' : 'Local mode — this device only'}</div>
            <div style={{fontSize:'.75rem',color:'var(--muted)',marginTop:2}}>{hasSupabaseEnv ? 'Tasks, goals, habits, faith, finance, wellness, and more — all in the cloud.' : 'Contact support to enable cross-device sync.'}</div>
          </div>
        </div>
        <BackupButton />
        {hasSupabaseEnv && (
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
            {[
              ['✓ Tasks & Calendar','Core data'],['🎯 Goals & Projects','Core data'],
              ['🔁 Habits','Core data'],['💰 Finance','Full sync'],
              ['✝ Faith','Full sync'],['🌿 Wellness','Full sync'],
              ['⚡ Productivity','Full sync'],['🌍 Lifestyle','Full sync'],
              ['↑ Growth','Full sync'],
            ].map(([label, status]) => (
              <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 10px',background:'var(--stone)',borderRadius:8,fontSize:'.78rem'}}>
                <span style={{fontWeight:500,color:'var(--ink2)'}}>{label}</span>
                <span style={{color:'var(--success)',fontWeight:600,fontSize:'.7rem'}}>✓ {status}</span>
              </div>
            ))}
          </div>
        )}
      </section>
      </Fold>

      {!isNative && (<Fold id="install" emoji="📲" title="Add to Home Screen" sub="Open the planner like an app">
      {!isNative && <section className="card">
        <p className="eyebrow">Quick Access</p>
        <button onClick={() => setA2hsOpen(true)} style={{
          width:'100%', display:'flex', alignItems:'center', gap:12, marginTop:8,
          padding:'12px 14px', borderRadius:'var(--radius-sm)', background:'var(--surface)',
          border:'1.5px solid var(--border2)', cursor:'pointer', textAlign:'left',
        }}>
          <div style={{width:40,height:40,borderRadius:'50%',background:'var(--teal)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.1rem',flexShrink:0}}>📱</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:600,fontSize:'.9rem',color:'var(--ink)'}}>Add to Home Screen</div>
            <div style={{fontSize:'.78rem',color:'var(--muted)',marginTop:2}}>Install the planner for full-screen, one-tap access</div>
          </div>
          <span style={{color:'var(--brass-fg)',fontSize:'1rem',flexShrink:0}}>→</span>
        </button>
      </section>}
      </Fold>)}

      <Fold id="reviews" emoji="⭐" title="Ratings & Reviews" sub="Tell us how it is going">
      <section className="card">
        <p className="eyebrow">Community</p>
        <button onClick={() => setShowReviews(true)} style={{
          width:'100%', display:'flex', alignItems:'center', gap:12, marginTop:8,
          padding:'12px 14px', borderRadius:'var(--radius-sm)', background:'var(--surface)',
          border:'1.5px solid var(--border2)', cursor:'pointer', textAlign:'left',
        }}>
          <div style={{width:40,height:40,borderRadius:'50%',background:'var(--brass)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:'1.1rem'}}>⭐</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:600,fontSize:'.9rem',color:'var(--ink)'}}>Ratings &amp; Reviews</div>
            <div style={{fontSize:'.78rem',color:'var(--muted)',marginTop:2}}>Share your experience or see what others say</div>
          </div>
          <span style={{color:'var(--brass-fg)',fontSize:'1rem',flexShrink:0}}>→</span>
        </button>
      </section>
      </Fold>

      <Fold id="explore" emoji="🧭" title="More from Elora Radiance Co." sub="Scripture-based tools for the whole Christian life">
      <section className="card">
        <p className="muted" style={{fontSize:'.8rem',lineHeight:1.6,margin:'10px 0 14px'}}>Scripture-based tools for the whole Christian life.</p>
        {[
          { label:'Armed & Anchored', desc:'Spiritual warfare training — 26 weapons', url:'https://armed.eloraradiance.com/', icon:'⚔️' },
          { label:'Anchored Steps · Year 1', desc:'52 weeks of faith in action', url:'https://steps.eloraradiance.com/', icon:'⚓' },
          { label:'Anchored Steps · Year 2', desc:'52 weeks of deeper study', url:'https://steps2.eloraradiance.com/', icon:'⚓' },
          { label:'The Red Letters', desc:'The words of Jesus by theme — free', url:'https://redletters.eloraradiance.com/', icon:'✦' },
          { label:'Anchored Verse', desc:'Scripture for every emotion — free', url:'https://verse.eloraradiance.com/', icon:'📖' },
        ].map(app => (
          <a key={app.url} href={app.url} target="_blank" rel="noopener noreferrer" style={{
            display:'flex', alignItems:'center', gap:12, padding:'12px 14px', marginBottom:8,
            borderRadius:'var(--radius-sm)', background:'var(--surface)', border:'1.5px solid var(--border2)',
            textDecoration:'none',
          }}>
            <span style={{fontSize:22,flexShrink:0}}>{app.icon}</span>
            <span style={{flex:1,minWidth:0}}>
              <span style={{display:'block',fontWeight:600,fontSize:'.9rem',color:'var(--ink)'}}>{app.label}</span>
              <span style={{display:'block',fontSize:'.78rem',color:'var(--muted)',marginTop:2}}>{app.desc}</span>
            </span>
            <span style={{color:'var(--brass-fg)',fontSize:'.95rem',flexShrink:0}}>↗</span>
          </a>
        ))}
      </section>
      </Fold>

      <Fold id="privacy" emoji="🔒" title="Privacy & Account" sub="Privacy, delete your account, Scripture credits">
      <section>
        <AccountPrivacy
          supabase={supabase}
          theme={PLANNER_SETTINGS_THEME}
          deletes="This permanently deletes your Living Planner account and everything in it: tasks, events, goals, habits, notes, journal, finances, faith and wellness entries, and settings. It can't be undone. Your account in the other Elora Radiance apps is separate and isn't affected."
        />
        <ScriptureCredits
          notices={['NIV_ALL', 'ESV', 'NKJV', 'KJV']}
          theme={PLANNER_SETTINGS_THEME}
        />
      </section>
      </Fold>

      <Fold id="support" emoji="💬" title="Support" sub="Email us; we answer within 24 hours">
      <section className="card" style={{background:'var(--ink)',border:'none'}}>
        <p className="eyebrow" style={{color:'var(--brass-fg)'}}>Support</p>
        <h3 style={{color:'var(--warm-white)',margin:'4px 0 14px'}}>We're here to help</h3>
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <a href="mailto:support@eloraradiance.com" style={{
            display:'flex',alignItems:'center',gap:12,padding:'14px',
            background:'rgba(255,255,255,.06)',borderRadius:10,
            border:'1px solid rgba(184,150,90,.2)',textDecoration:'none'
          }}>
            <div style={{width:40,height:40,borderRadius:'50%',background:'var(--brass)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.1rem',flexShrink:0}}>✉</div>
            <div>
              <div style={{color:'var(--warm-white)',fontWeight:600,fontSize:'.9rem'}}>Email Support</div>
              <div style={{color:'var(--brass-fg)',fontSize:'.8rem',marginTop:2}}>support@eloraradiance.com</div>
              <div style={{color:'rgba(255,255,255,.64)',fontSize:'.72rem',marginTop:2}}>We respond within 24 hours</div>
            </div>
          </a>
          <div style={{padding:'12px 14px',background:'rgba(255,255,255,.04)',borderRadius:10,border:'1px solid rgba(255,255,255,.08)'}}>
            <div style={{color:'rgba(255,255,255,.5)',fontSize:'.78rem',lineHeight:1.6}}>
              For bugs, feature requests, billing questions, or anything else — reach out anytime. Built with care by a real person who wants this to work for you.
            </div>
          </div>
          <div style={{display:'flex',flexWrap:'wrap',justifyContent:'center',gap:'6px 16px',paddingTop:2}}>
            {[
              ['Help & Support', 'https://eloraradiance.com/support.html'],
              ['Privacy Policy', 'https://eloraradiance.com/privacy.html'],
              ['Terms of Service', 'https://eloraradiance.com/terms.html'],
            ].map(([label, href]) => (
              <a key={href} href={href} target="_blank" rel="noopener noreferrer"
                 style={{color:'rgba(255,255,255,.72)',fontSize:'.78rem',textDecoration:'underline',textUnderlineOffset:3}}>{label}</a>
            ))}
          </div>
        </div>
      </section>
      </Fold>

      </div>

      {/* ── Sign out ── */}
      <section className="card">
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <div>
            <p className="eyebrow">Account</p>
            <div style={{fontSize:'.85rem', color:'var(--muted)'}}>Signed in as {profile.displayName || 'User'}</div>
          </div>
          <button className="danger-btn" style={{fontSize:'.85rem', padding:'8px 16px'}} onClick={signOut}>Sign Out</button>
        </div>
      </section>

      {a2hsOpen && <A2HSModal onClose={() => setA2hsOpen(false)} />}
      {showReviews && <Reviews app="tlp" appName="The Living Planner" eyebrow="The Living Planner" userEmail={user?.email} C={{ bg:'var(--stone)', bgCard:'var(--surface)', border:'var(--border2)', cream:'var(--ink)', text:'var(--text2)', muted:'var(--muted)', dim:'#C4BEB5', red:'var(--teal)', redL:'var(--teal2)', gold:'var(--brass)', goldF:'var(--brass-dim)', goldB:'var(--brass-glow)' }} lightMode={true} onClose={() => setShowReviews(false)} />}
      <PageNav />
    </div>
  )
}

export { MorePage }

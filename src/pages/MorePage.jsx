import React, { useState } from 'react'
import { usePlannerData } from '../context/PlannerContext.jsx'
import NotificationSettings from '../components/NotificationSettings.jsx'
import { supabase } from '../services/supabase.js'

function MorePage({ profile, settings, updateProfile, updateSettings, onEdit, onDelete, onQuickCreate }) {
  const { signOut } = useAuth()

  return (
    <div className="screen-stack">
      <div style={{display:"flex",alignItems:"center",gap:8,paddingBottom:2}}>
        <span style={{fontSize:"1.1rem"}}>⚙</span>
        <p style={{fontSize:".62rem",fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:"var(--brass)",margin:0}}>Settings</p>
      </div>

      {/* ── Profile ────────────────────────────────────────────────── */}
      <section className="card">
        <div className="section-title-row" style={{marginBottom:14}}>
          <div><p className="eyebrow">Account</p><h3>Profile</h3></div>
        </div>
        <div style={{display:'grid', gap:12}}>
          <label style={{display:'grid', gap:5, fontSize:'.85rem', fontWeight:600, color:'var(--text2)'}}>
            Display Name
            <input value={profile.displayName || ''} onChange={(e) => updateProfile({ ...profile, displayName: e.target.value })}
              style={{padding:'10px 12px', border:'1.5px solid var(--border2)', borderRadius:'var(--radius-sm)', fontSize:'.9rem', color:'var(--text)', background:'var(--surface)'}} />
          </label>
          <label style={{display:'grid', gap:5, fontSize:'.85rem', fontWeight:600, color:'var(--text2)'}}>
            Timezone
            <input value={profile.timezone || ''} onChange={(e) => updateProfile({ ...profile, timezone: e.target.value })}
              style={{padding:'10px 12px', border:'1.5px solid var(--border2)', borderRadius:'var(--radius-sm)', fontSize:'.9rem', color:'var(--text)', background:'var(--surface)'}} />
          </label>
          <label style={{display:'grid', gap:5, fontSize:'.85rem', fontWeight:600, color:'var(--text2)'}}>
            Planner Mode
            <select value={profile.plannerMode || 'Balanced'} onChange={(e) => updateProfile({ ...profile, plannerMode: e.target.value })}
              style={{padding:'10px 12px', border:'1.5px solid var(--border2)', borderRadius:'var(--radius-sm)', fontSize:'.9rem', color:'var(--text)', background:'var(--surface)'}}>
              <option>Balanced</option>
              <option>Execution</option>
              <option>Wellness</option>
              <option>Growth</option>
            </select>
          </label>
        </div>
      </section>

      {/* ── Settings ───────────────────────────────────────────────── */}
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



      {/* ── Sync / Data ────────────────────────────────────────────── */}
      <section className="card">
        <p className="eyebrow">Data & Sync</p>
        <h3 style={{margin:'4px 0 14px'}}>Cross-Device Sync</h3>
        <div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',borderRadius:'var(--radius-sm)',background:'var(--surface)'}}>
          <div style={{width:12,height:12,borderRadius:'50%',background:hasSupabaseEnv?'var(--success)':'var(--warning)',flexShrink:0,boxShadow:hasSupabaseEnv?'0 0 8px var(--success)':undefined}} />
          <div>
            <div style={{fontWeight:600,fontSize:'.9rem'}}>{hasSupabaseEnv ? '✓ Connected — syncing across all devices' : 'Local mode — this device only'}</div>
            <div style={{fontSize:'.75rem',color:'var(--muted)',marginTop:2}}>{hasSupabaseEnv ? 'Your tasks, goals, habits, and data are saved to the cloud.' : 'Contact support to enable cross-device sync.'}</div>
          </div>
        </div>
      </section>

      {/* ── Sign out ───────────────────────────────────────────────── */}
      <section className="card">
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <div>
            <p className="eyebrow">Account</p>
            <div style={{fontSize:'.85rem', color:'var(--muted)'}}>Signed in as {profile.displayName || 'User'}</div>
          </div>
          <button className="danger-btn" style={{fontSize:'.85rem', padding:'8px 16px'}} onClick={signOut}>Sign Out</button>
        </div>
      </section>

      {/* ── Push Notifications (coming soon) ──────────────────────────── */}

      {/* ── Support & Contact ──────────────────────────────────────── */}
      <section className="card" style={{background:'var(--ink)',border:'none'}}>
        <p className="eyebrow" style={{color:'var(--brass)'}}>Support</p>
        <h3 style={{color:'var(--warm-white)',margin:'4px 0 14px'}}>We're here to help</h3>
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <a href="mailto:support@thelivingplanner.app" style={{
            display:'flex',alignItems:'center',gap:12,padding:'14px',
            background:'rgba(255,255,255,.06)',borderRadius:10,
            border:'1px solid rgba(184,150,90,.2)',textDecoration:'none'
          }}>
            <div style={{width:40,height:40,borderRadius:'50%',background:'var(--brass)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.1rem',flexShrink:0}}>✉</div>
            <div>
              <div style={{color:'var(--warm-white)',fontWeight:600,fontSize:'.9rem'}}>Email Support</div>
              <div style={{color:'var(--brass)',fontSize:'.8rem',marginTop:2}}>support@thelivingplanner.app</div>
              <div style={{color:'rgba(255,255,255,.4)',fontSize:'.72rem',marginTop:2}}>We respond within 24 hours</div>
            </div>
          </a>
          <div style={{padding:'12px 14px',background:'rgba(255,255,255,.04)',borderRadius:10,border:'1px solid rgba(255,255,255,.08)'}}>
            <div style={{color:'rgba(255,255,255,.5)',fontSize:'.78rem',lineHeight:1.6}}>
              For bugs, feature requests, billing questions, or anything else — reach out anytime. Built with care by a real person who wants this to work for you.
            </div>
          </div>
        </div>
      </section>

    </div>
  )
}

export default MorePage

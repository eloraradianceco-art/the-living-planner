import React, { useState, useEffect } from 'react'
import { PlannerPush } from '../services/push.js'

function NotificationSettings({ settings, updateSettings }) {
  const [permission, setPermission] = useState(() => { try { return (typeof Notification !== 'undefined' ? Notification.permission : 'default') } catch { return 'default' } })
  const [supported, setSupported] = useState(false)
  const [loading, setLoading] = useState(false)
  const notifSettings = settings?.notifications || {}

  useEffect(() => {
    PlannerPush.isSupported().then(setSupported)
    if ('Notification' in window) setPermission(Notification.permission)
  }, [])

  const enable = async () => {
    setLoading(true)
    const perm = await PlannerPush.requestPermission()
    setPermission(perm)
    if (perm === 'granted') {
      await PlannerPush.subscribe()
      // Enable all notifications by default
      updateSettings({ ...settings, notifications: {
        tasks: true, habits: true, goals: true, faith: true,
        reflection: true, birthdays: true, overdue: true, finance: false
      }})
    }
    setLoading(false)
  }

  const toggle = (key) => {
    updateSettings({ ...settings, notifications: { ...notifSettings, [key]: !notifSettings[key] }})
  }

  const CATEGORIES = [
    { key: 'tasks',      icon: '✓',  label: 'Task Reminders',     desc: 'Due today at 9am' },
    { key: 'habits',     icon: '🔁', label: 'Habit Check-In',      desc: 'Daily reminder at 8am' },
    { key: 'goals',      icon: '🎯', label: 'Goal Nudges',         desc: 'Weekly progress reminder' },
    { key: 'faith',      icon: '✝',  label: 'Morning Devotional',  desc: 'Daily at 6am' },
    { key: 'reflection', icon: '📖', label: 'Evening Reflection',  desc: 'Daily at 7pm' },
    { key: 'birthdays',  icon: '🎂', label: 'Birthday Reminders',  desc: 'Day-of at 8am' },
    { key: 'overdue',    icon: '⚠',  label: 'Overdue Alerts',      desc: 'When tasks are past due' },
    { key: 'finance',    icon: '💰', label: 'Spending Check',       desc: 'Weekly budget summary' },
  ]

  return (
    <section className="card">
      <p className="eyebrow">Notifications</p>
      <h3 style={{margin: '4px 0 14px'}}>Stay on Track</h3>

      {!supported ? (
        <div style={{padding:'12px',background:'var(--stone)',borderRadius:10,fontSize:'.85rem',color:'var(--muted)'}}>
          Push notifications are not supported on this browser.
        </div>
      ) : permission === 'denied' ? (
        <div style={{padding:'14px',background:'#fde8e8',borderRadius:10}}>
          <strong style={{fontSize:'.88rem',color:'var(--danger)'}}>Notifications Blocked</strong>
          <p style={{fontSize:'.8rem',color:'var(--ink2)',margin:'6px 0 0',lineHeight:1.5}}>
            You've blocked notifications for this site. To enable them, click the lock icon in your browser's address bar and allow notifications, then refresh.
          </p>
        </div>
      ) : permission === 'default' ? (
        <div>
          <p className="muted" style={{fontSize:'.85rem',marginBottom:14,lineHeight:1.6}}>
            Get reminders for your tasks, habits, devotional, birthdays and more — right on your device.
          </p>
          <button className="primary-btn" style={{width:'100%',fontSize:'.9rem'}}
            onClick={enable} disabled={loading}>
            {loading ? 'Enabling...' : '🔔 Enable Push Notifications'}
          </button>
        </div>
      ) : (
        <div>
          <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 12px',background:'#d5f5e3',borderRadius:8,marginBottom:16}}>
            <div style={{width:10,height:10,borderRadius:'50%',background:'var(--success)',boxShadow:'0 0 6px var(--success)'}} />
            <span style={{fontSize:'.85rem',fontWeight:600,color:'var(--success)'}}>Notifications enabled</span>
          </div>

          <p style={{fontWeight:600,fontSize:'.85rem',marginBottom:10}}>Choose what to receive:</p>
          {CATEGORIES.map(cat => (
            <div key={cat.key} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'11px 0',borderBottom:'1px solid var(--border)'}}>
              <div style={{display:'flex',gap:10,alignItems:'center'}}>
                <span style={{fontSize:'1.1rem',width:24,textAlign:'center'}}>{cat.icon}</span>
                <div>
                  <div style={{fontWeight:600,fontSize:'.88rem'}}>{cat.label}</div>
                  <div className="muted" style={{fontSize:'.72rem'}}>{cat.desc}</div>
                </div>
              </div>
              <button onClick={() => toggle(cat.key)} style={{
                width:44,height:24,borderRadius:999,border:'none',cursor:'pointer',
                background:notifSettings[cat.key] ? 'var(--teal)' : 'var(--border2)',
                position:'relative',transition:'background .2s',flexShrink:0
              }}>
                <div style={{
                  position:'absolute',top:3,
                  left:notifSettings[cat.key] ? 23 : 3,
                  width:18,height:18,borderRadius:'50%',
                  background:'white',transition:'left .2s',
                  boxShadow:'0 1px 3px rgba(0,0,0,.2)'
                }} />
              </button>
            </div>
          ))}

          <button onClick={async()=>{ await PlannerPush.unsubscribe(); setPermission('default'); updateSettings({...settings,notifications:{}})}}
            style={{marginTop:14,background:'none',border:'1px solid var(--border)',borderRadius:8,padding:'8px 14px',fontSize:'.78rem',color:'var(--muted)',cursor:'pointer',width:'100%'}}>
            Disable All Notifications
          </button>
        </div>
      )}
    </section>
  )
}

export default NotificationSettings

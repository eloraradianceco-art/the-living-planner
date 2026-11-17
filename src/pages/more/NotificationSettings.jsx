// Settings: reminders.
import { useEffect, useState } from 'react'
import { CircleSlash, PenLine, SquareCheck, Cake, Target, Wallet, Repeat, Cross } from 'lucide-react'
import { isIOS, PlannerPush } from '../../lib/push.js'
import { isStandalone } from '../../components/A2HS.jsx'

const REMINDER_TYPES = [
  { key: 'tasks',      icon: SquareCheck, label: 'Tasks, events & appointments', desc: 'Before anything with a time, a 7:30 AM rundown, and appointments the evening before' },
  { key: 'faith',      icon: Cross,       label: 'Morning devotional',  desc: 'Daily at 6:00 AM' },
  { key: 'habits',     icon: Repeat,      label: 'Habit check-in',      desc: 'Daily at 8:00 AM, only if habits are left' },
  { key: 'birthdays',  icon: Cake,        label: 'Birthdays',           desc: 'Day-of at 8:00 AM' },
  { key: 'overdue',    icon: CircleSlash, label: 'Overdue tasks',       desc: 'Daily at 9:00 AM, only if something is past due' },
  { key: 'reflection', icon: PenLine,     label: 'Evening reflection',  desc: 'Daily at 7:00 PM' },
  { key: 'goals',      icon: Target,      label: 'Weekly goal review',  desc: 'Sundays at 5:00 PM with your next step' },
  { key: 'finance',    icon: Wallet,      label: 'Weekly spending',     desc: 'Sundays at 6:00 PM vs your budget' },
]
const REMINDER_DEFAULTS = { tasks: true, habits: true, goals: true, faith: true, reflection: true, birthdays: true, overdue: true, finance: false, leadMinutes: 15 }

function NotificationSettings({ settings, updateSettings }) {
  const [permission, setPermission] = useState(() => { try { return (typeof Notification !== 'undefined' ? Notification.permission : 'default') } catch { return 'default' } })
  const [supported, setSupported] = useState(true)
  const [connected, setConnected] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const n = { ...REMINDER_DEFAULTS, ...(settings?.notifications || {}) }
  const needsInstall = isIOS() && !isStandalone()

  useEffect(() => {
    PlannerPush.isSupported().then(setSupported)
    PlannerPush.permission().then(setPermission)
    PlannerPush.deviceConnected().then(setConnected)
  }, [])

  const save = (patch) => updateSettings({ ...settings, notifications: { ...n, ...patch } })

  const enable = async () => {
    setBusy(true); setMsg('')
    const perm = await PlannerPush.requestPermission()
    setPermission(perm)
    if (perm === 'granted') {
      const sub = await PlannerPush.subscribe()
      setConnected(Boolean(sub))
      if (!settings?.notifications || !Object.keys(settings.notifications).length) save({})
      setMsg(sub ? 'This device will get reminders.' : 'Permission granted, but this device could not be registered. Try again.')
    }
    setBusy(false)
  }
  const test = async () => {
    setBusy(true); setMsg('')
    try {
      if (!connected) { const sub = await PlannerPush.subscribe(); setConnected(Boolean(sub)) }
      const r = await PlannerPush.sendTest()
      setMsg(r?.sent ? `Sent to ${r.sent} device${r.sent > 1 ? 's' : ''}. It should arrive in a few seconds.` : r?.devices ? 'This device is registered, but the test could not be delivered right now. Try again in a minute.' : 'No devices are registered yet.')
    } catch (e) { setMsg('Could not send a test right now.') }
    setBusy(false)
  }
  const disable = async () => {
    setBusy(true)
    await PlannerPush.unsubscribe()
    setConnected(false); setMsg('This device will no longer get reminders.')
    setBusy(false)
  }

  return (
    <section className="card">
      <p className="eyebrow">Reminders</p>
      <h3 style={{ margin: '4px 0 6px' }}>Stay on track</h3>
      <p className="muted" style={{ fontSize: '.82rem', margin: '0 0 14px', lineHeight: 1.5 }}>Reminders arrive on your phone even when the planner is closed. Times follow your profile's timezone.</p>

      {needsInstall ? (
        <div className="rem-note">
          <strong>Add the planner to your Home Screen first</strong>
          <p>On iPhone and iPad, reminders only work from the Home Screen app. Tap Share, then "Add to Home Screen", then open the planner from that icon and come back here.</p>
        </div>
      ) : !supported ? (
        <div className="rem-note"><strong>Not supported here</strong><p>This browser can't receive reminders. Try Safari (Home Screen app) on iPhone/iPad or Chrome on Android/desktop.</p></div>
      ) : permission === 'denied' ? (
        <div className="rem-note warn"><strong>Notifications are blocked</strong><p>Allow notifications for this app in your device settings, then reopen the planner.</p></div>
      ) : permission !== 'granted' || connected === false ? (
        <button className="primary-btn" style={{ width: '100%' }} onClick={enable} disabled={busy}>{busy ? 'Turning on…' : 'Turn on reminders for this device'}</button>
      ) : (
        <div className="rem-status"><span className="rem-dot" /> This device gets reminders</div>
      )}

      {msg && <p className="muted" style={{ fontSize: '.8rem', margin: '10px 0 0' }}>{msg}</p>}

      <div className="rem-lead">
        <span>Remind me before timed items</span>
        <select value={n.leadMinutes} onChange={(e) => save({ leadMinutes: Number(e.target.value) })}>
          {[5, 10, 15, 30, 60, 120].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} hr`}</option>)}
        </select>
      </div>

      {REMINDER_TYPES.map((t) => {
        const Icon = t.icon
        const onOff = Boolean(n[t.key])
        return (
          <div key={t.key} className="rem-row">
            <span className="rem-icon"><Icon size={17} strokeWidth={1.7} /></span>
            <div className="rem-text"><strong>{t.label}</strong><small>{t.desc}</small></div>
            <button type="button" role="switch" aria-checked={onOff} aria-label={t.label} className={'rem-switch' + (onOff ? ' on' : '')} onClick={() => save({ [t.key]: !onOff })}><span /></button>
          </div>
        )
      })}

      {permission === 'granted' && connected && (
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="secondary-btn" style={{ flex: 1 }} onClick={test} disabled={busy}>Send a test</button>
          <button className="ghost-btn" style={{ flex: 1 }} onClick={disable} disabled={busy}>Turn off on this device</button>
        </div>
      )}
    </section>
  )
}

export { NotificationSettings }

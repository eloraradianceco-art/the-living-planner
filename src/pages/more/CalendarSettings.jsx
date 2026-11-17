// Settings: Apple Calendar (App Store app only). Connect, choose which calendars show, turn it off.
import { useState } from 'react'
import { deviceCal, useDeviceCalendar } from '../../lib/deviceCalendar.js'

function CalendarSettings() {
  const cal = useDeviceCalendar()
  const [busy, setBusy] = useState(false)
  if (!cal.supported) return null // the website can't read a device's calendars
  const on = cal.on && cal.status === 'granted'
  const connect = async () => { setBusy(true); try { await deviceCal.connect() } finally { setBusy(false) } }
  // Group by account (iCloud, Gmail, Exchange …) the way the Calendar app does
  const groups = []
  for (const c of cal.calendars) {
    const name = c.account || 'On this device'
    let g = groups.find((x) => x.name === name)
    if (!g) groups.push(g = { name, items: [] })
    g.items.push(c)
  }

  return (
    <section className="card" id="apple-calendar">
      <p className="eyebrow">Calendars</p>
      <h3 style={{ margin: '4px 0 6px' }}>Apple Calendar</h3>
      <p className="muted" style={{ fontSize: '.82rem', margin: '0 0 14px', lineHeight: 1.5 }}>
        See the calendars on this {/iPad/.test(navigator.userAgent) ? 'iPad' : 'iPhone'} (iCloud, and any Google, Outlook or work account added in iOS Settings) next to your tasks.
        Your calendar stays on this device: it isn't copied to our servers, and the planner changes an event only when you ask it to.
      </p>

      {cal.status === 'denied' ? (
        <div className="rem-note warn"><strong>Calendar access is off</strong><p>Open the Settings app → Privacy &amp; Security → Calendars → Living Planner, choose Full Access, then come back here.</p></div>
      ) : !on ? (
        <button className="primary-btn" style={{ width: '100%' }} onClick={connect} disabled={busy || cal.status === 'unknown'}>{busy ? 'Connecting…' : 'Connect Apple Calendar'}</button>
      ) : (<>
        <div className="rem-status"><span className="rem-dot" /> Showing on your Calendar and Home</div>
        {groups.length === 0 && <p className="muted" style={{ fontSize: '.82rem', margin: '12px 0 0' }}>No calendars found on this device.</p>}
        {groups.map((g) => (
          <div key={g.name} className="devcal-group">
            <div className="devcal-account">{g.name}</div>
            {g.items.map((c) => {
              const shown = !cal.hidden.includes(c.id)
              return (
                <div key={c.id} className="rem-row">
                  <span className="devcal-dot" style={{ background: c.color || '#6B7A8F' }} aria-hidden="true" />
                  <div className="rem-text"><strong>{c.title}</strong>{!c.writable && <small>View only</small>}</div>
                  <button type="button" role="switch" aria-checked={shown} aria-label={`Show ${c.title}`} className={'rem-switch' + (shown ? ' on' : '')} onClick={() => deviceCal.toggleCalendar(c.id)}><span /></button>
                </div>
              )
            })}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="ghost-btn" style={{ flex: 1 }} onClick={() => deviceCal.disconnect()}>Stop showing Apple Calendar</button>
        </div>
      </>)}
    </section>
  )
}

export { CalendarSettings }

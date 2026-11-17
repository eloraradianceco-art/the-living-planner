// An event from the person's Apple Calendar: what, when, where, which calendar, and what can be done with it.
// One-time events open Apple's own editor over the planner; repeating ones are changed in Apple Calendar
// (see the plugin notes in native.js).
import { useState } from 'react'
import { Repeat } from 'lucide-react'
import { formatDateLabel, fmt12 } from '../lib/dates.js'
import { PlaceLink } from './Place.jsx'
import { deviceCal } from '../lib/deviceCalendar.js'

const pad = (n) => String(n).padStart(2, '0')
const dayOf = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
const timeOf = (ms) => { const d = new Date(ms); return fmt12(`${pad(d.getHours())}:${pad(d.getMinutes())}`) }
const longDay = (date) => formatDateLabel(date, { weekday: 'short', month: 'short', day: 'numeric' })

// "Tue, Nov 18 · 9:00 – 10:00 AM", "Tue, Nov 18 · All day", "Fri, Nov 20, 9:00 PM – Sat, Nov 21, 1:00 AM"
function whenText(item) {
  const first = dayOf(item.startMs), last = dayOf(item.endMs > item.startMs ? item.endMs - 1 : item.endMs)
  if (item.allDay) return first === last ? `${longDay(first)} · All day` : `${longDay(first)} – ${longDay(last)} · All day`
  if (first === last) return `${longDay(first)} · ${timeOf(item.startMs)} – ${timeOf(item.endMs)}`
  return `${longDay(first)}, ${timeOf(item.startMs)} – ${longDay(last)}, ${timeOf(item.endMs)}`
}

function DeviceEventSheet({ item, onClose, onToast = () => {} }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!item) return null
  const canChange = deviceCal.canChange(item)
  const canEdit = item.writable && !item.isRepeat // Apple's editor handles multi-day events
  const run = async (fn) => { setBusy(true); setError(''); try { await fn() } catch { setError("That didn't go through. Open Apple Calendar to make the change.") } finally { setBusy(false) } }
  const edit = () => run(async () => {
    const result = await deviceCal.editWithApple(item)
    if (result === 'saved') onToast('Event updated', `Saved to ${item.calendarName}.`, 'success')
    if (result === 'deleted') onToast('Event deleted', `Removed from ${item.calendarName}.`, 'success')
    if (result !== 'canceled') onClose()
  })
  const remove = () => run(async () => {
    if (!window.confirm(`Delete "${item.title}" from ${item.calendarName}? This removes it from your Apple Calendar on every device.`)) return
    await deviceCal.remove(item)
    onToast('Event deleted', `Removed from ${item.calendarName}.`, 'success')
    onClose()
  })

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet devcal-sheet" role="dialog" aria-modal="true" aria-label={item.title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
          <h2 className="modal-title" style={{ margin: 0 }}>{item.title}</h2>
          <button type="button" className="devcal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="devcal-cal"><span className="devcal-dot" style={{ background: item.color }} aria-hidden="true" />{item.calendarName}{item.account && item.account !== item.calendarName ? ` · ${item.account}` : ''}</div>
        <p className="devcal-when">{whenText(item)}</p>
        {item.isRepeat && <p className="devcal-line"><Repeat size={13} strokeWidth={2} aria-hidden="true" /> Repeats</p>}
        <PlaceLink place={item.location} className="devcal-place" />
        {item.notes && <p className="devcal-notes">{item.notes}</p>}

        {!canEdit && (
          <p className="muted devcal-hint">
            {!item.writable ? 'This calendar is view only.' : 'Repeating events are changed in Apple Calendar, so one date or the whole series is handled correctly.'}
          </p>
        )}
        {error && <p role="alert" className="devcal-error">{error}</p>}
        <div className="devcal-actions">
          {canEdit && <button type="button" className="primary-btn" onClick={edit} disabled={busy}>Edit</button>}
          {canChange && <button type="button" className="danger-btn" onClick={remove} disabled={busy}>Delete</button>}
          {!canEdit && <button type="button" className="secondary-btn" onClick={() => run(() => deviceCal.openInCalendar(item))} disabled={busy}>Open in Apple Calendar</button>}
        </div>
      </div>
    </div>
  )
}

export { DeviceEventSheet }

// Sleep math: hours between bedtime and wake time, with the AM/PM fix.

// Bedtime → wake span. iOS time pickers make it easy to save 9:30 AM for 9:30 PM;
// anything over 16h is read as an AM/PM slip and corrected (bed +12h, or wake −12h).
const hhmm = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
function sleepSpan(bed, wake) {
  const b = String(bed || '').match(/^(\d{1,2}):(\d{2})/), w = String(wake || '').match(/^(\d{1,2}):(\d{2})/)
  if (!b || !w) return null
  let bh = Number(b[1]), wh = Number(w[1]); const bm = Number(b[2]), wm = Number(w[2])
  let mins = (wh * 60 + wm) - (bh * 60 + bm)
  if (mins <= 0) mins += 24 * 60
  let fixed = ''
  if (mins > 16 * 60) {
    if (bh < 12) { bh += 12; fixed = 'bed' } else if (wh >= 12) { wh -= 12; fixed = 'wake' }
    if (fixed) mins -= 12 * 60
  }
  return { hours: Math.round(mins / 30) / 2, bed: hhmm(bh, bm), wake: hhmm(wh, wm), fixed }
}
const sleepHoursFrom = (bed, wake) => sleepSpan(bed, wake)?.hours ?? ''
const fmtHours = (h) => { const n = Number(h); if (!Number.isFinite(n) || n <= 0) return ''; const H = Math.floor(n), M = Math.round((n - H) * 60); return M ? `${H}h ${M}m` : `${H}h` }
const SLEEP_MAX_HOURS = 16

export { sleepSpan, sleepHoursFrom, fmtHours, SLEEP_MAX_HOURS }

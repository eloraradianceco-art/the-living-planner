// Wellness helpers: readiness, sleep math, shared lists.
import { sleepDurationScore } from '../../lib/score.js'
import { SLEEP_MAX_HOURS } from '../../lib/sleep.js'

// Readiness 0–100 from last night's sleep, energy, soreness, stress and pain.
function readinessOf(c) {
  if (!c) return null
  const h = Number(c.sleepHours)
  const sleepPart = !h || h > SLEEP_MAX_HOURS ? 0.6 : sleepDurationScore(h)
  const energy = ((Number(c.energy) || 3) - 1) / 4
  const sore = (5 - (Number(c.soreness) || 3)) / 4
  const stress = (5 - (Number(c.stress) || 3)) / 4
  const pain = Math.min(15, (c.pain || []).length * 5)
  return Math.max(0, Math.min(100, Math.round((sleepPart * 30 + energy * 30 + sore * 25 + stress * 15) - pain)))
}
function readinessBand(score) {
  if (score == null) return null
  if (score >= 75) return { label: 'Train hard', tone: 'good', advice: 'Green light. Push the main work today.' }
  if (score >= 50) return { label: 'Train light', tone: 'mid', advice: 'Moderate volume, longer warm-up, leave a rep or two in the tank.' }
  return { label: 'Recover', tone: 'low', advice: 'Walk, stretch, hydrate, sleep early. Growth happens in recovery.' }
}
const PAIN_AREAS = ['Neck', 'Shoulders', 'Upper back', 'Low back', 'Hips', 'Knees', 'Ankles/feet', 'Elbows/wrists']
const TRAINING_TYPES = ['Strength', 'Hypertrophy', 'Conditioning', 'Calisthenics', 'Mobility', 'Combat', 'Cardio', 'HIIT', 'Running', 'Walking', 'Sports', 'Other']
const exKey = (n) => String(n || '').trim().toLowerCase()
const fmtSet = (e) => [e.sets && e.reps ? `${e.sets}×${e.reps}` : e.sets ? `${e.sets} sets` : e.reps ? `${e.reps} reps` : '', e.weight ? `@ ${e.weight} lb` : ''].filter(Boolean).join(' ')

export { readinessOf, readinessBand, PAIN_AREAS, TRAINING_TYPES, exKey, fmtSet }

// The Living Planner — reminder service.
// Runs every 5 minutes (pg_cron → pg_net) and sends web push reminders:
//   • timed tasks & events (incl. repeating events), N minutes before (default 15)
//   • health appointments: evening before (6 PM) and 1 hour before
//   • daily: devotional 6:00, today's tasks 7:30, habits 8:00, birthdays 8:00,
//     overdue 9:00, evening reflection 19:00
//   • weekly (Sunday): goals 17:00, spending 18:00
// Each reminder is logged in reminder_log so it is sent once.
//
// Actions (POST JSON):
//   { action: 'init' }  → returns the VAPID public key (creates the key pair once)
//   { action: 'test' }  → sends a test to the signed-in user's devices (Bearer token)
//   {} with x-cron-secret header → the scheduled run
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'
import webpush from 'npm:web-push@3.6.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUBJECT = 'https://the-living-planner.vercel.app'
const WINDOW_MS = 15 * 60 * 1000 // only send reminders that came due in the last 15 minutes
const DEFAULT_TZ = 'America/Chicago'
const DEFAULT_TOGGLES = { tasks: true, habits: true, goals: true, faith: true, reflection: true, birthdays: true, overdue: true, finance: false }

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// ── Keys ────────────────────────────────────────────────────────────────
async function getSecret(name: string): Promise<string | null> {
  const { data } = await sb.rpc('reminders_get_secret', { p_name: name })
  return (data as string) || null
}
async function ensureVapid(): Promise<{ publicKey: string; privateKey: string }> {
  let priv = await getSecret('vapid_private_key')
  const { data: row } = await sb.from('app_config').select('value').eq('key', 'vapid_public_key').maybeSingle()
  if (priv && row?.value) return { publicKey: row.value, privateKey: priv }
  const k = webpush.generateVAPIDKeys()
  const { data: pub, error } = await sb.rpc('reminders_init_vapid', { p_public: k.publicKey, p_private: k.privateKey })
  if (error) throw error
  priv = await getSecret('vapid_private_key')
  return { publicKey: pub as string, privateKey: priv! }
}

// ── Time helpers (user's timezone) ──────────────────────────────────────
function validTz(tz?: string | null) {
  try { if (tz) { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz } } catch { /* fall through */ }
  return DEFAULT_TZ
}
function partsIn(ms: number, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
  }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, hh: Number(p.hour), mm: Number(p.minute), ss: Number(p.second), weekday: p.weekday as string }
}
// Local wall-clock date + "HH:MM" in tz → UTC milliseconds
function zonedToUtc(date: string, time: string, tz: string) {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = (time || '00:00').split(':').map(Number)
  const wall = Date.UTC(y, m - 1, d, hh || 0, mm || 0)
  let guess = wall
  for (let i = 0; i < 2; i++) {
    const p = partsIn(guess, tz)
    const [py, pm, pd] = p.date.split('-').map(Number)
    const asUtc = Date.UTC(py, pm - 1, pd, p.hh, p.mm, p.ss)
    guess = wall - (asUtc - guess)
  }
  return guess
}
const addDays = (date: string, n: number) => {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return t.toISOString().slice(0, 10)
}
const fmt12 = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m || 0).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}
const isTime = (t?: string | null) => !!t && /^\d{1,2}:\d{2}/.test(t)

// Repeating events: one row per series → the occurrences that fall in [from, to]
function expandEvents(rows: Array<Record<string, any>>, from: string, to: string) {
  const out: Array<Record<string, any>> = []
  for (const ev of rows) {
    const r = ev.recurrence || 'none'
    if (r === 'none') { if (ev.date >= from && ev.date <= to) out.push(ev); continue }
    const skip = new Set<string>(Array.isArray(ev.skip_dates) ? ev.skip_dates : [])
    const end = ev.recurrence_until && ev.recurrence_until < to ? ev.recurrence_until : to
    for (let d = from; d <= end; d = addDays(d, 1)) {
      if (d < ev.date || skip.has(d)) continue
      const gap = Math.round((Date.parse(d + 'T12:00:00Z') - Date.parse(ev.date + 'T12:00:00Z')) / 86400000)
      const hit = r === 'daily' ? true : r === 'weekly' ? gap % 7 === 0 : r === 'biweekly' ? gap % 14 === 0 : r === 'monthly' ? d.slice(8) === ev.date.slice(8) : false
      if (hit) out.push({ ...ev, date: d })
    }
  }
  return out
}

type Reminder = { key: string; at: number; title: string; body: string; url: string; tag?: string }

// ── Build the reminders that are due for one user ───────────────────────
async function remindersFor(userId: string, now: number) {
  const [{ data: settingsRow }, { data: profile }] = await Promise.all([
    sb.from('planner_settings').select('notifications').eq('user_id', userId).maybeSingle(),
    sb.from('profiles').select('timezone').eq('user_id', userId).maybeSingle(),
  ])
  const stored = (settingsRow?.notifications || {}) as Record<string, unknown>
  const on = { ...DEFAULT_TOGGLES, ...stored } as Record<string, unknown>
  const lead = Math.max(0, Math.min(240, Number(on.leadMinutes ?? 15) || 15))
  const tz = validTz(profile?.timezone)
  const local = partsIn(now, tz)
  const today = local.date
  const tomorrow = addDays(today, 1)
  const out: Reminder[] = []
  const daily = (key: string, time: string, title: string, body: string, url: string) =>
    out.push({ key: `${key}:${today}`, at: zonedToUtc(today, time, tz), title, body, url, tag: key })

  if (on.tasks) {
    const [{ data: tasks }, { data: events }, { data: appts }] = await Promise.all([
      sb.from('tasks').select('id,title,date,time,completed').eq('user_id', userId).in('date', [today, tomorrow]).eq('completed', false),
      sb.from('events').select('id,title,date,time,recurrence,recurrence_until,skip_dates').eq('user_id', userId).lte('date', tomorrow)
        .or(`recurrence.neq.none,date.in.(${today},${tomorrow})`),
      sb.from('page_data').select('data_value').eq('user_id', userId).eq('page', 'wellness').eq('data_key', 'appointments').maybeSingle(),
    ])
    for (const t of tasks || []) {
      if (!isTime(t.time)) continue
      out.push({ key: `task:${t.id}:${t.date}T${t.time}`, at: zonedToUtc(t.date, t.time, tz) - lead * 60000,
        title: lead ? `In ${lead} min · ${fmt12(t.time)}` : `Now · ${fmt12(t.time)}`, body: t.title, url: '/calendar', tag: `task-${t.id}` })
    }
    for (const e of expandEvents(events || [], today, tomorrow)) {
      if (!isTime(e.time)) continue
      out.push({ key: `event:${e.id}:${e.date}T${e.time}`, at: zonedToUtc(e.date, e.time, tz) - lead * 60000,
        title: lead ? `In ${lead} min · ${fmt12(e.time)}` : `Now · ${fmt12(e.time)}`, body: e.title, url: '/calendar', tag: `event-${e.id}` })
    }
    for (const a of (appts?.data_value || []) as Array<{ id: number; date: string; time?: string; who: string; reason?: string }>) {
      if (!a?.date || (a.date !== today && a.date !== tomorrow && a.date !== addDays(today, 2))) continue
      const time = isTime(a.time) ? a.time! : '09:00'
      const what = a.reason ? `${a.who} · ${a.reason}` : a.who
      out.push({ key: `appt-eve:${a.id}:${a.date}`, at: zonedToUtc(addDays(a.date, -1), '18:00', tz),
        title: `Tomorrow at ${fmt12(time)}`, body: what, url: '/wellness?tab=care', tag: `appt-${a.id}` })
      out.push({ key: `appt-1h:${a.id}:${a.date}T${time}`, at: zonedToUtc(a.date, time, tz) - 3600000,
        title: `In 1 hour · ${fmt12(time)}`, body: what, url: '/wellness?tab=care', tag: `appt-${a.id}` })
    }
    const untimed = (tasks || []).filter((t) => t.date === today && !isTime(t.time))
    const timed = (tasks || []).filter((t) => t.date === today && isTime(t.time))
    if (untimed.length + timed.length > 0) {
      const first = [...timed].sort((a, b) => a.time.localeCompare(b.time))[0]
      daily('today', '07:30', `Today: ${untimed.length + timed.length} task${untimed.length + timed.length > 1 ? 's' : ''}`,
        first ? `First up: ${first.title} at ${fmt12(first.time)}` : (untimed[0]?.title || ''), '/tasks')
    }
  }

  if (on.faith) daily('faith', '06:00', 'Morning devotional', 'Start your day in the Word. Today\'s verse is waiting.', '/faith')

  if (on.habits) {
    const [{ data: habits }, { data: logs }] = await Promise.all([
      sb.from('habits').select('id').eq('user_id', userId),
      sb.from('habit_logs').select('habit_id,completed').eq('user_id', userId).eq('date', today),
    ])
    const total = (habits || []).length
    const done = (logs || []).filter((l) => l.completed).length
    if (total > done) daily('habits', '08:00', 'Habit check-in', `${total - done} habit${total - done > 1 ? 's' : ''} to complete today.`, '/habits')
  }

  if (on.birthdays) {
    const { data: bd } = await sb.from('page_data').select('data_value').eq('user_id', userId).eq('page', 'lifestyle').eq('data_key', 'birthdays').maybeSingle()
    for (const b of (bd?.data_value || []) as Array<{ name: string; date: string; relationship?: string }>) {
      if (!b?.date || b.date.slice(5) !== today.slice(5)) continue
      out.push({ key: `bday:${today}:${b.name}`, at: zonedToUtc(today, '08:00', tz), title: `Birthday today 🎂`, body: `${b.name}${b.relationship ? ` (${b.relationship})` : ''}`, url: '/lifestyle', tag: 'bday' })
    }
  }

  if (on.overdue) {
    const { count } = await sb.from('tasks').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('completed', false).lt('date', today).neq('date', '')
    if ((count || 0) > 0) daily('overdue', '09:00', 'Overdue', `${count} task${count! > 1 ? 's' : ''} past due. Reschedule or knock one out.`, '/tasks')
  }

  if (on.reflection) daily('reflect', '19:00', 'Evening reflection', 'Five minutes: what went well, what to carry into tomorrow.', '/growth')

  if (local.weekday === 'Sun' && on.goals) {
    const { data: goals } = await sb.from('goals').select('title,steps,completed').eq('user_id', userId).eq('completed', false)
    if ((goals || []).length) {
      const next = (goals || []).map((g) => ({ g, s: (g.steps || []).find((x: { done: boolean }) => !x.done) })).find((x) => x.s)
      daily('goals', '17:00', 'Weekly review', next ? `Next step on "${next.g.title}": ${next.s.text}` : `${goals!.length} goal${goals!.length > 1 ? 's' : ''} in progress. Set next week's steps.`, '/goals')
    }
  }

  if (local.weekday === 'Sun' && on.finance) {
    const weekStart = addDays(today, -6)
    const [{ data: budget }, { data: exp }] = await Promise.all([
      sb.from('budgets').select('weekly_target').eq('user_id', userId).maybeSingle(),
      sb.from('expenses').select('amount,category,date').eq('user_id', userId).gte('date', weekStart).lte('date', today),
    ])
    const spent = (exp || []).filter((e) => !['Bills', 'Utilities', 'Rent', 'Insurance'].includes(e.category)).reduce((n, e) => n + Number(e.amount || 0), 0)
    const target = Number(budget?.weekly_target || 0)
    daily('finance', '18:00', 'Weekly spending', target ? `$${spent.toFixed(0)} of your $${target.toFixed(0)} weekly target.` : `$${spent.toFixed(0)} spent this week.`, '/finance')
  }

  return out.filter((r) => r.at <= now && r.at > now - WINDOW_MS)
}

// ── Sending ─────────────────────────────────────────────────────────────
type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }
async function sendTo(subs: Sub[], payload: Record<string, unknown>) {
  let sent = 0
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600, urgency: 'high' })
      sent++
      await sb.from('push_subscriptions').update({ last_success_at: new Date().toISOString() }).eq('id', s.id)
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) await sb.from('push_subscriptions').delete().eq('id', s.id) // device unsubscribed
      else console.error('push failed', code, (err as Error).message)
    }
  }
  return sent
}

async function run(now: number) {
  const { data: subs, error } = await sb.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth')
  if (error) throw error
  const byUser = new Map<string, Sub[]>()
  for (const s of (subs || []) as Sub[]) byUser.set(s.user_id, [...(byUser.get(s.user_id) || []), s])
  let delivered = 0, reminders = 0
  for (const [userId, userSubs] of byUser) {
    try {
      for (const r of await remindersFor(userId, now)) {
        // Claim the reminder first so overlapping runs can't double-send
        const { data: claimed } = await sb.from('reminder_log').upsert({ user_id: userId, reminder_key: r.key }, { onConflict: 'user_id,reminder_key', ignoreDuplicates: true }).select('reminder_key')
        if (!claimed || !claimed.length) continue
        reminders++
        delivered += await sendTo(userSubs, { title: r.title, body: r.body, url: r.url, tag: r.tag || r.key })
      }
    } catch (err) { console.error('user run failed', userId, (err as Error).message) }
  }
  // Keep the log small
  await sb.from('reminder_log').delete().lt('sent_at', new Date(now - 14 * 86400000).toISOString())
  return { users: byUser.size, reminders, delivered }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const body = await req.json().catch(() => ({})) as { action?: string }
    const keys = await ensureVapid()
    webpush.setVapidDetails(SUBJECT, keys.publicKey, keys.privateKey)

    if (body.action === 'init') return json({ publicKey: keys.publicKey })

    if (body.action === 'test') {
      const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
      const { data: u } = await sb.auth.getUser(token)
      if (!u?.user) return json({ error: 'Sign in required' }, 401)
      const { data: subs } = await sb.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth').eq('user_id', u.user.id)
      const sent = await sendTo((subs || []) as Sub[], { title: 'Reminders are on', body: 'This is how your planner will reach you.', url: '/more', tag: 'test' })
      return json({ devices: (subs || []).length, sent })
    }

    const secret = await getSecret('reminders_cron_secret')
    if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'unauthorized' }, 401)
    return json(await run(Date.now()))
  } catch (err) {
    console.error(err)
    return json({ error: (err as Error).message }, 500)
  }
})

// Free vs Pro: prices, limits, which pages and tabs are Pro, and the hook that reads the plan.
import React from 'react'
import { isNative, NATIVE_PURCHASES, storeSignIn } from '../native.js'
import { hasSupabaseEnv, supabase } from './supabase.js'

// ── Upgrade link from the website (?upgrade=monthly|annual) ─────────
;(function readUpgradeIntent() {
  try {
    const u = new URL(window.location.href)
    const p = u.searchParams.get('upgrade')
    if (!p) return
    localStorage.setItem('planner_upgrade_intent', JSON.stringify({ plan: p === 'annual' ? 'annual' : 'monthly', at: Date.now() }))
    u.searchParams.delete('upgrade')
    window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash)
  } catch {}
})()
function takeUpgradeIntent() {
  try {
    const v = JSON.parse(localStorage.getItem('planner_upgrade_intent') || 'null')
    localStorage.removeItem('planner_upgrade_intent')
    return v && Date.now() - v.at < 3600000 ? v.plan : null
  } catch { return null }
}


// ── Stripe Configuration ──────────────────────────────────────────────────
const STRIPE_CONFIG = {
  publishableKey: 'pk_live_51Sxe7pBr8nMXOo8tUrruWNZ7BkQ0OsKlfqtgKuksLAIcBfCHGtnPv19QP2sIrZz7nQJzDr4SH0OT6ZJ7yxubDUF3007nOd9RJE',
  monthlyLink: 'https://buy.stripe.com/00w7sKcrG8dEe110Rl57W05',
  annualLink: 'https://buy.stripe.com/dRm14majydxYaOP8jN57W06',
  // No free trial (removed 2026-11-14): both links charge at checkout.
  prices: {
    monthly: 7.99,
    annual: 59.99,
  },
}
const PRO_PRICE_LINE = isNative ? 'Monthly or yearly · Cancel anytime' : '$7.99/mo or $59.99/yr · Cancel anytime'

// ── Free vs Pro (2026-11-14) ──────────────────────────────────────────────
// Free: Home (Balanced mode), Tasks, Calendar, reminders, Calculator, and a starter tab in each life area
// (Finance → Budget Plan, Wellness → Mood, Faith → Devotional + Prayer, Lifestyle → Groceries,
// Productivity → Brain Dump, Notes, Tips), plus the limits below.
// Pro: everything else, unlimited habits/goals/projects, every Home mode, and the Growth page.
// Limits count active items (completed goals/projects don't count). Nothing a person already has is removed;
// only new ones past the limit are held back.
const FREE_LIMITS = {
  habits: 3,
  goals: 2,
  projects: 2,
}
const FREE_MODES = ['Balanced']
const PRO_ROUTES = ['/growth']
const activeCount = (type, items = []) =>
  type === 'goal' ? items.filter((g) => !g.completed).length
    : type === 'project' ? items.filter((p) => p.status !== 'Completed').length
    : items.length
const PRO_FEATURES = [
  ['💰', 'Full Finance', 'income, bills, savings, debt payoff & credit cards, giving, net worth'],
  ['❤️', 'Full Health & Wellness', 'training, nutrition, sleep, recovery, meds, body metrics'],
  ['🙏', 'All of Faith', 'scripture, Bible reading plan, gratitude, fasting, sermons, faith goals'],
  ['📈', 'Growth & Life Score', 'the 7 areas behind your score, 30-day trends, weekly review'],
  ['♾️', 'No limits', 'unlimited habits, goals and projects, and every Home mode'],
  ['🏡', 'Lifestyle & Focus', 'recipes, trips, birthdays, gifts, cleaning, mind maps, checklists, focus timer'],
]

// ── Subscription Hook ─────────────────────────────────────────────────────
// Complimentary Pro (owner/staff) is the profiles.pro_comp flag, set in the database only.

// Stripe checkout links carry the account, so the purchase is matched to it.
function plannerCheckoutUrl(base, user) {
  if (!user) return base
  const q = new URLSearchParams({ client_reference_id: user.id })
  if (user.email) q.set('prefilled_email', user.email)
  return `${base}?${q.toString()}`
}

// Pro is set only by Stripe (through the purchase webhook) or profiles.pro_comp.
// The app reads it; it never writes it.
function useSubscription(user) {
  const [tier, setTierState] = React.useState(() => {
    try { return localStorage.getItem('planner_tier') || 'free' } catch { return 'free' }
  })
  // After checkout Stripe sends people back with ?welcome=pro&session_id=…
  // Pro turns on when Stripe's notice reaches the webhook, usually within seconds.
  const [arrival] = React.useState(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      return params.get('welcome') === 'pro' ? { sessionId: params.get('session_id') || null } : null
    } catch { return null }
  })
  const [welcome, setWelcome] = React.useState(arrival ? 'confirming' : null) // confirming | done | waiting
  const [checked, setChecked] = React.useState(false) // the tier has been confirmed with the server this session

  const apply = React.useCallback((row) => {
    if (!row) return null
    const finalTier = row.pro_comp ? 'pro' : (row.tier || 'free')
    setTierState(finalTier)
    try {
      localStorage.setItem('planner_tier', finalTier)
      localStorage.removeItem('planner_trial_ends')
    } catch {}
    return finalTier
  }, [])

  React.useEffect(() => {
    if (!user || !hasSupabaseEnv) return
    let cancelled = false
    let timer = null
    const active = (t) => t === 'pro' || t === 'trial'

    const readProfile = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('tier, pro_comp')
        .eq('user_id', user.id)
        .maybeSingle()
      return error ? null : data
    }

    const load = async (attempt = 0) => {
      let t = apply(await readProfile())
      if (cancelled) return
      if (!active(t)) {
        // Links a subscription paid with this account's email (or the checkout just finished).
        try { await supabase.rpc('claim_planner_subscription', { p_checkout_session: arrival?.sessionId || null }) } catch {}
        if (cancelled) return
        t = apply(await readProfile())
        if (cancelled) return
      }
      setChecked(true)
      if (!arrival) return
      if (active(t)) setWelcome('done')
      else if (attempt < 12) timer = setTimeout(() => load(attempt + 1), 2500)
      else setWelcome('waiting')
    }

    if (arrival) { try { window.history.replaceState({}, '', window.location.pathname) } catch {} }
    load()

    // Realtime: Stripe changes (renewal, cancellation) show up without a reload.
    const channel = supabase
      .channel('subscription_' + user.id)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'profiles',
        filter: `user_id=eq.${user.id}`,
      }, payload => {
        const t = apply(payload.new)
        if (arrival && active(t)) setWelcome(w => (w === 'confirming' || w === 'waiting') ? 'done' : w)
      })
      .subscribe()

    return () => { cancelled = true; clearTimeout(timer); supabase.removeChannel(channel) }
  }, [user?.id])

  // App Store app: a purchase or restore just finished (NativeProPlans) → have the server read it from Apple
  // (store-sync) and show Confirming → Welcome. Also checked once on each open, so renewals, cancellations
  // and refunds show up even if a notice was missed.
  React.useEffect(() => {
    if (!NATIVE_PURCHASES || !user || !hasSupabaseEnv) return
    let cancelled = false, timer = null
    const read = async () => {
      const { data } = await supabase.from('profiles').select('tier, pro_comp').eq('user_id', user.id).maybeSingle()
      return data ? apply(data) : null
    }
    const sync = () => supabase.functions.invoke('store-sync', { body: { action: 'sync' } }).catch(() => null)
    const confirm = async (attempt = 0) => {
      if (attempt === 0) await sync()
      const t = await read()
      if (cancelled) return
      if (t === 'pro' || t === 'trial') setWelcome('done')
      else if (attempt < 8) timer = setTimeout(() => { if (attempt % 3 === 2) sync(); confirm(attempt + 1) }, 2000)
      else setWelcome('waiting')
    }
    const onPurchased = () => { setWelcome('confirming'); clearTimeout(timer); confirm(0) }
    window.addEventListener('planner-store-purchased', onPurchased)
    storeSignIn(user.id).then(() => sync()).then(() => !cancelled && read())
    return () => { cancelled = true; clearTimeout(timer); window.removeEventListener('planner-store-purchased', onPurchased) }
  }, [user?.id])

  // 'trial' is kept as Pro for any subscription that started before trials were removed.
  const isPro = tier === 'pro' || tier === 'trial'
  const dismissWelcome = React.useCallback(() => setWelcome(null), [])

  return { tier, isPro, welcome, dismissWelcome, checked }
}

export {
  takeUpgradeIntent, STRIPE_CONFIG, PRO_PRICE_LINE, FREE_LIMITS, FREE_MODES, PRO_ROUTES,
  activeCount, PRO_FEATURES, plannerCheckoutUrl, useSubscription,
}

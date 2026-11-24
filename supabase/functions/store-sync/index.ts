// The Living Planner — Apple in-app purchases (through RevenueCat) → Pro.
//
// Two callers, one rule: never trust what the caller says; re-read the buyer's state from RevenueCat and save it.
//   • RevenueCat webhook: POST { event: { app_user_id, original_app_user_id, aliases, transferred_from, transferred_to, … } }
//     If the Vault secret `revenuecat_webhook_auth` exists, the request's Authorization header must equal it.
//   • The App Store app, right after a purchase or restore and when it opens: POST { action: 'sync' } with the
//     person's Bearer token (only their own account is checked).
// The RevenueCat secret API key lives in Vault as `revenuecat_secret_key`. Until it exists nothing changes.
// Each checked account gets a row in app_store_entitlements; planner_refresh_tier() then sets profiles.tier
// from Stripe and Apple together.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const ENTITLEMENT = 'pro'
const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const secret = async (name: string) => ((await sb.rpc('reminders_get_secret', { p_name: name })).data as string | null) || null

type Ent = { expires_date?: string | null; grace_period_expires_date?: string | null; product_identifier?: string }
type Sub = { store?: string; period_type?: string; is_sandbox?: boolean; unsubscribe_detected_at?: string | null; billing_issues_detected_at?: string | null }

export function entitlementRow(userId: string, subscriber: { entitlements?: Record<string, Ent>; subscriptions?: Record<string, Sub> }, now = Date.now()) {
  const ent = subscriber?.entitlements?.[ENTITLEMENT]
  if (!ent) return { user_id: userId, active: false, product_id: null, store: null, period_type: null, is_sandbox: null, expires_at: null, will_renew: null, billing_issue: null }
  const exp = ent.expires_date ? Date.parse(ent.expires_date) : null
  const grace = ent.grace_period_expires_date ? Date.parse(ent.grace_period_expires_date) : null
  const until = exp === null ? null : Math.max(exp, grace || 0)
  const s = ent.product_identifier ? subscriber.subscriptions?.[ent.product_identifier] : undefined
  return {
    user_id: userId,
    active: until === null || until > now,
    product_id: ent.product_identifier || null,
    store: s?.store || null,
    period_type: s?.period_type || null,
    is_sandbox: s?.is_sandbox ?? null,
    expires_at: until === null ? null : new Date(until).toISOString(),
    will_renew: s ? !s.unsubscribe_detected_at : null,
    billing_issue: s ? !!s.billing_issues_detected_at : null,
  }
}

async function syncUser(userId: string, apiKey: string) {
  if (!UUID.test(userId)) return { userId, skipped: 'not an account id' }
  const { data: who } = await sb.auth.admin.getUserById(userId)
  if (!who?.user) return { userId, skipped: 'no such account' }
  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    // No X-Platform header: RevenueCat treats a secret key sent with it as a key leaked into an app and answers 403 (code 7243).
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`RevenueCat ${res.status}`)
  const row = entitlementRow(userId, (await res.json()).subscriber || {})
  // Someone who never bought in the app gets no row (and their tier is left alone)
  const { data: existing } = await sb.from('app_store_entitlements').select('user_id').eq('user_id', userId).maybeSingle()
  if (!row.product_id && !existing) return { userId, active: false, tier: null }
  const { error } = await sb.from('app_store_entitlements').upsert({ ...row, checked_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) throw error
  const { data: tier, error: e2 } = await sb.rpc('planner_refresh_tier', { p_user: userId })
  if (e2) throw e2
  return { userId, active: row.active, tier }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  try {
    const body = await req.json().catch(() => ({})) as { action?: string; event?: Record<string, unknown> }
    const apiKey = await secret('revenuecat_secret_key')
    if (!apiKey) return json({ ok: false, error: 'In-app purchases are not set up yet' }, 503)

    if (body.action === 'sync') {
      const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
      const { data: u } = await sb.auth.getUser(token)
      if (!u?.user) return json({ error: 'Sign in required' }, 401)
      return json({ ok: true, ...(await syncUser(u.user.id, apiKey)) })
    }

    // RevenueCat webhook
    const auth = await secret('revenuecat_webhook_auth')
    if (auth && req.headers.get('Authorization') !== auth) return json({ error: 'unauthorized' }, 401)
    const ev = body.event || {}
    const ids = new Set<string>()
    for (const v of [ev.app_user_id, ev.original_app_user_id, ...[].concat((ev.aliases as string[]) || []), ...[].concat((ev.transferred_from as string[]) || []), ...[].concat((ev.transferred_to as string[]) || [])]) {
      if (typeof v === 'string' && UUID.test(v)) ids.add(v)
    }
    const results = []
    for (const id of ids) results.push(await syncUser(id, apiKey))
    return json({ ok: true, type: ev.type || null, results })
  } catch (err) {
    console.error('store-sync', (err as Error).message)
    // 500 → RevenueCat retries the webhook later
    return json({ ok: false, error: (err as Error).message }, 500)
  }
})

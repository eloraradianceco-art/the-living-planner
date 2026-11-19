// @build iap
// Buying Pro inside the App Store app (Apple in-app purchase through RevenueCat), with a simulated iPhone bridge.
// Ported 2026-11-16 from iap-test.cjs. Run: npm test -- app-store-purchases
// Planner App Store build with in-app purchase turned on (test RevenueCat key), in Chromium with a simulated
// iPhone Capacitor bridge including the RevenueCat plugin ("Purchases"), against the mock database.
const path = require('path')
const H = require('../harness.cjs')
const { chromium, devices, APP, DB } = H
const UID = '11111111-2222-3333-4444-555555555555'
const out = H.OUT
const session = {
  access_token: 'x.' + Buffer.from(JSON.stringify({ sub: UID, exp: 4102444800 })).toString('base64') + '.y',
  token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'r',
  user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'tester@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
}
function fakeIphone({ prefs }) {
  const PLUGINS = {
    Preferences: ['get', 'set', 'remove', 'keys', 'clear'],
    PushNotifications: ['checkPermissions', 'requestPermissions', 'register', 'unregister', 'getDeliveredNotifications', 'removeAllDeliveredNotifications', 'createChannel', 'removeAllListeners'],
    StatusBar: ['setStyle', 'setBackgroundColor', 'show', 'hide', 'setOverlaysWebView', 'getInfo'],
    Share: ['share', 'canShare'], Filesystem: ['writeFile', 'readFile', 'deleteFile', 'mkdir', 'getUri', 'stat'],
    App: ['exitApp', 'getInfo', 'getState', 'minimizeApp', 'removeAllListeners'],
    Purchases: ['configure', 'getOfferings', 'purchasePackage', 'restorePurchases', 'logIn', 'logOut', 'getCustomerInfo', 'isConfigured', 'setLogLevel'],
  }
  const f = window.__fake = { prefs: { ...prefs }, calls: [], listeners: {}, n: 0, buy: 'ok', owned: false, opened: [] }
  window.open = (u) => { f.opened.push(String(u)); return null }
  window.webkit = { messageHandlers: { bridge: { postMessage() {} } } }
  window.Capacitor = window.Capacitor || {}
  window.Capacitor.PluginHeaders = Object.entries(PLUGINS).map(([name, ms]) => ({
    name, methods: [...ms.map((m) => ({ name: m, rtype: 'promise' })), { name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'promise' }],
  }))
  window.Capacitor.nativeCallback = (plugin, method, options) => { const id = 'cb' + (++f.n); if (method === 'addListener') (f.listeners[plugin + ':' + options.eventName] ||= []).push({ id }); return id }
  const info = () => ({ originalAppUserId: f.user || '$RCAnonymousID:x', entitlements: { active: f.owned ? { pro: { identifier: 'pro', isActive: true } } : {}, all: {} } })
  window.Capacitor.nativePromise = async (plugin, method, o = {}) => {
    if (plugin === 'Purchases') f.calls.push('Purchases.' + method + (method === 'configure' || method === 'logIn' ? ' ' + JSON.stringify({ appUserID: o.appUserID, key: (o.apiKey || '').slice(0, 5) }) : method === 'purchasePackage' ? ' ' + o.aPackage?.product?.identifier : ''))
    if (plugin === 'Preferences') {
      if (method === 'get') return { value: o.key in f.prefs ? f.prefs[o.key] : null }
      if (method === 'set') { f.prefs[o.key] = o.value; return }
      if (method === 'remove') { delete f.prefs[o.key]; return }
      return {}
    }
    if (plugin === 'Purchases') {
      if (method === 'configure') { f.user = o.appUserID; return }
      if (method === 'logIn') { f.user = o.appUserID; return { customerInfo: info(), created: false } }
      if (method === 'logOut') { f.user = null; return { customerInfo: info() } }
      if (method === 'getCustomerInfo') return { customerInfo: info() }
      if (method === 'getOfferings') {
        const pk = (id, type, pid, price, amt) => ({ identifier: id, packageType: type, offeringIdentifier: 'default', product: { identifier: pid, priceString: price, price: amt, currencyCode: 'USD', title: 'Living Planner Pro' } })
        const cur = { identifier: 'default', availablePackages: [pk('$rc_annual', 'ANNUAL', 'planner_pro_yearly', '$49.99', 49.99)] }
        return { current: cur, all: { default: cur } }
      }
      if (method === 'purchasePackage') {
        await new Promise((r) => setTimeout(r, 200))
        if (f.buy === 'cancel') throw { code: '1', userCancelled: true, message: 'Purchase was cancelled.' }
        if (f.buy === 'pending') throw { code: '20', userCancelled: false, message: 'The payment is pending.' }
        if (f.buy === 'fail') throw { code: '2', userCancelled: false, message: 'There was a problem with the App Store.' }
        f.owned = true
        return { productIdentifier: o.aPackage.product.identifier, customerInfo: info() }
      }
      if (method === 'restorePurchases') return { customerInfo: info() }
      return {}
    }
    if (plugin === 'PushNotifications' && method === 'checkPermissions') return { receive: 'prompt' }
    return {}
  }
}
const results = []
const check = (name, ok, extra = '') => results.push((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''))
;(async () => {
  const browser = await chromium.launch()
  await fetch(DB + '/__reset'); await fetch(DB + '/__set?tier=free'); await fetch(DB + '/__apple?pro=0&ent=0')
  const ctx = await browser.newContext({ ...devices['iPhone 14'] })
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ body: '' }))
  await ctx.addInitScript(fakeIphone, { prefs: { 'sb-localhost-auth-token': JSON.stringify(session) } })
  const p = await ctx.newPage(); const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  const fake = (k) => p.evaluate((key) => window.__fake[key], k)
  const st = async () => (await (await fetch(DB + '/__state')).json())

  // ── Opens, store signed in as the planner account ──
  await p.goto(APP + '/'); await p.waitForTimeout(2500)
  let calls = await fake('calls')
  check('RevenueCat configured with the account id', calls.some((c) => c.startsWith('Purchases.configure') && c.includes(UID) && c.includes('appl_')), calls.join(' | '))
  check('Checked with the server on open', ((await st()).storeSync || []).some((b) => b.action === 'sync'))

  // ── Pro gate now offers Pro, with no web prices or Stripe ──
  await p.goto(APP + '/finance?tab=income'); await p.waitForTimeout(1500)
  check('Gate shows Unlock Pro', (await p.getByRole('button', { name: /Unlock Pro/ }).count()) === 1)
  check('Gate price line has no web prices', /Billed yearly · Cancel anytime/.test(await p.locator('main').innerText()) && !/\$49\.99|\$7\.99|\$59\.99/.test(await p.locator('main').innerText()))
  await p.getByRole('button', { name: /Unlock Pro/ }).click(); await p.waitForTimeout(800)
  const card = p.getByRole('dialog')
  const ct = await card.innerText()
  check('One plan from Apple: yearly with per-month, no monthly plan', /Yearly — \$49\.99 a year/.test(ct) && /About \$4\.17 a month/.test(ct) && !/Monthly —/.test(ct), ct.replace(/\s+/g, ' ').slice(0, 200))
  check('Restore purchases + renewal terms + links', /Restore purchases/.test(ct) && /renews\s+automatically/.test(ct) && (await card.getByRole('link', { name: 'Terms of Use' }).count()) === 1 && (await card.getByRole('link', { name: 'Privacy Policy' }).count()) === 1)
  check('No Stripe links in the app', !(await p.content()).includes('buy.stripe.com'))
  await p.screenshot({ path: path.join(out, 'iap-plans.png') })

  // ── Cancel: nothing happens ──
  await p.evaluate(() => { window.__fake.buy = 'cancel' })
  await card.getByRole('button', { name: /Yearly —/ }).click(); await p.waitForTimeout(600)
  check('Cancel leaves the sheet quietly', (await p.getByRole('dialog').count()) === 1 && !(await p.getByRole('status').count()))
  // ── Ask to Buy: pending message ──
  await p.evaluate(() => { window.__fake.buy = 'pending' })
  await card.getByRole('button', { name: /Yearly —/ }).click(); await p.waitForTimeout(600)
  check('Pending purchase explains itself', /waiting for approval/.test(await card.innerText()))
  // ── Store error: message ──
  await p.evaluate(() => { window.__fake.buy = 'fail' })
  await card.getByRole('button', { name: /Yearly —/ }).click(); await p.waitForTimeout(600)
  check('Store error shows Apple\'s message', /problem with the App Store/.test(await card.innerText()))

  // ── Buy yearly: sheet closes, Confirming → Welcome, Pro opens ──
  await p.evaluate(() => { window.__fake.buy = 'ok' })
  await fetch(DB + '/__apple?pro=1')
  await card.getByRole('button', { name: /Yearly —/ }).click(); await p.waitForTimeout(300)
  calls = await fake('calls')
  check('Bought the yearly package', calls.some((c) => c === 'Purchases.purchasePackage planner_pro_yearly'))
  await p.waitForTimeout(2500)
  const body = await p.locator('body').innerText()
  check('Welcome to Pro after Apple confirms', /Welcome to Pro!/.test(body), body.slice(0, 120))
  check('Server was asked to read the purchase', ((await st()).storeSync || []).filter((b) => b.action === 'sync').length >= 2)
  check('Income tab unlocked', (await p.getByRole('button', { name: /Unlock Pro/ }).count()) === 0)
  await p.screenshot({ path: path.join(out, 'iap-welcome.png') })

  // ── Settings: Apple subscriber → Manage opens Apple's subscriptions ──
  await p.goto(APP + '/more'); await p.waitForTimeout(2000); await H.openFolds(p)
  check('Settings says it\'s an App Store subscription', /through the App Store/.test(await p.locator('main').innerText()))
  await p.getByRole('button', { name: 'Manage', exact: true }).click(); await p.waitForTimeout(300)
  check('Manage opens Apple\'s subscriptions', (await fake('opened')).includes('https://apps.apple.com/account/subscriptions'))
  await p.screenshot({ path: path.join(out, 'iap-settings.png') })

  // ── Restore on a fresh free account state ──
  await fetch(DB + '/__set?tier=free'); await fetch(DB + '/__apple?pro=0&ent=0')
  await p.evaluate(() => { window.__fake.owned = false; localStorage.setItem('planner_tier', 'free') })
  await p.goto(APP + '/more'); await p.waitForTimeout(2000); await H.openFolds(p)
  await p.getByRole('button', { name: 'Restore purchases' }).click(); await p.waitForTimeout(500)
  check('Restore with nothing to restore says so', /No Living Planner Pro subscription was found/.test(await p.locator('main').innerText()))
  await p.evaluate(() => { window.__fake.owned = true }); await fetch(DB + '/__apple?pro=1')
  await p.getByRole('button', { name: 'Restore purchases' }).click(); await p.waitForTimeout(2800)
  check('Restore with a subscription turns Pro on', /Welcome to Pro!/.test(await p.locator('body').innerText()))

  // ── Sign out signs the store out too ──
  const so = p.getByRole('button', { name: /Sign out/i })
  if (await so.count()) { await so.first().scrollIntoViewIfNeeded(); await so.first().click(); await p.waitForTimeout(1000) }
  check('Sign out signs RevenueCat out', (await fake('calls')).includes('Purchases.logOut'))
  check('No page errors', errs.length === 0, errs.join(' | '))
  await browser.close()
  H.report({ failed: results.filter((x) => x.startsWith('FAIL')), checks: results.length })
})().catch((e) => { console.error(e); process.exit(1) })

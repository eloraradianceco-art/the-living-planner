// The App Store app's shell (sign-in storage, reminders through Apple, backup to Files, no web checkout),
// run in a browser with a simulated iPhone bridge. Ported 2026-11-16 from native-test.cjs. Run: npm test -- app-store-shell
// Runs the planner's App Store build in Chromium with a simulated iPhone Capacitor bridge
// (window.webkit.messageHandlers.bridge + Capacitor.nativePromise/nativeCallback), against the mock DB.
const path = require('path')
const H = require('../harness.cjs')
const { chromium, devices, fakeIphone } = H
const APP = 'http://localhost:4830', DB = 'http://localhost:4831'
const out = H.OUT
const UID = '11111111-2222-3333-4444-555555555555'

const session = {
  access_token: 'x.' + Buffer.from(JSON.stringify({ sub: UID, exp: 4102444800 })).toString('base64') + '.y',
  token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'r',
  user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'tester@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
}

async function run() {
  const results = {}
  const browser = await chromium.launch()
  const errors = []
  const ctx = await browser.newContext({ ...devices['iPhone 14'] })
  await ctx.clock.install({ time: new Date('2026-11-16T12:00:00-06:00') })
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ body: '' }))
  await ctx.addInitScript(fakeIphone, { prefs: { 'sb-localhost-auth-token': JSON.stringify(session) } })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errors.push(e.message))
  const state = async () => (await (await fetch(DB + '/__state')).json())
  const html = async () => await p.content()

  // 1. Signs in from the phone's own storage and opens the planner
  await fetch(DB + '/__set?tier=free')
  await p.goto(APP + '/'); await p.waitForTimeout(2500)
  results.signedInFromNativeStorage = (await p.locator('input[type="email"]').count()) === 0 && (await p.locator('nav').count()) > 0
  results.statusBarDark = (await p.evaluate(() => window.__fake.calls.filter((c) => c.startsWith('StatusBar.setStyle')))).join()
  results.noInstallPrompt = (await p.getByText('Add to Home Screen').count()) === 0
  await p.screenshot({ path: path.join(out, 'native-home.png') })

  // 2. Pro-locked section: no trial, price or checkout
  await p.goto(APP + '/finance'); await p.waitForTimeout(1500)
  await p.locator('#sec-pro > summary').click(); await p.waitForTimeout(600) // locked sections sit in the "7 more with Pro" row (2026-11-19)
  const tabs = p.locator('button', { hasText: /Income|Savings|Debt/ })
  if (await tabs.count()) { await tabs.first().click(); await p.waitForTimeout(600) }
  results.gateText = (await p.getByText('part of Living Planner Pro').count()) > 0
  results.gateHasNoTrial = (await p.locator('#sec-pro').getByText(/Free Trial|free trial|\$\d/).count()) === 0 // inside the Pro row: Budget Plan above it shows the user's own dollar amounts
  await p.screenshot({ path: path.join(out, 'native-gate.png') })

  // 3. More page: no Upgrade button, no install card, no Stripe links
  await p.goto(APP + '/more'); await p.waitForTimeout(2000); await H.openFolds(p)
  results.moreNoUpgrade = (await p.getByRole('button', { name: 'Upgrade', exact: true }).count()) === 0
  results.moreNoInstallCard = (await p.getByText('Install the planner for full-screen').count()) === 0
  results.noStripeLinksMore = !(await html()).includes('buy.stripe.com')

  // 4. Reminders: turn on → Apple registration → token saved to the account
  const turnOn = p.getByRole('button', { name: /Turn on reminders/ })
  results.reminderNoHomeScreenNote = (await p.getByText('Add the planner to your Home Screen first').count()) === 0
  if (await turnOn.count()) { await turnOn.scrollIntoViewIfNeeded(); await turnOn.click(); await p.waitForTimeout(1200) }
  let st = await state()
  results.tokenSaved = st.nativePush.map((x) => ({ p_platform: x.p_platform, tokenLen: (x.p_token || '').length }))
  results.reminderStatusShown = (await p.getByText('This device gets reminders').count()) > 0
  results.tokenKeptOnDevice = await p.evaluate(() => window.__fake.prefs.planner_apns_token || null)
  const testBtn = p.getByRole('button', { name: 'Send a test' })
  if (await testBtn.count()) { await testBtn.click(); await p.waitForTimeout(1000) }
  results.testMessage = await p.getByText(/registered, but the test|Sent to|No devices/).first().textContent().catch(() => null)
  await p.screenshot({ path: path.join(out, 'native-reminders.png') })

  // 5. Backup → saved file handed to the share sheet
  const backup = p.getByRole('button', { name: /Backup/ })
  if (await backup.count()) { await backup.scrollIntoViewIfNeeded(); await backup.click(); await p.waitForTimeout(2000) }
  results.backupCalls = (await p.evaluate(() => window.__fake.calls.filter((c) => c.startsWith('Filesystem.writeFile') || c.startsWith('Share.share')))).map((c) => c.slice(0, 140))

  // 6. Turn off reminders → device removed from the account
  const off = p.getByRole('button', { name: 'Turn off on this device' })
  if (await off.count()) { await off.click(); await p.waitForTimeout(800) }
  st = await state()
  results.offDeletes = st.pushDeletes

  // 7. Tapping a reminder opens its page
  await p.evaluate(() => window.__fake.emit('PushNotifications', 'pushNotificationActionPerformed', { actionId: 'tap', notification: { data: { url: '/habits' } } }))
  await p.waitForTimeout(800)
  results.tapOpens = new URL(p.url()).pathname

  // 8. Trial member: "Manage" shows the in-app note, not plans
  await fetch(DB + '/__set?tier=trial')
  await p.goto(APP + '/'); await p.waitForTimeout(2500)
  const manage = p.getByRole('button', { name: 'Manage' })
  if (await manage.count()) { await manage.first().click(); await p.waitForTimeout(600) }
  results.upgradeCardNoPlans = !(await html()).includes('buy.stripe.com') && (await p.getByText(/\$49\.99|\$59\.99|\$7\.99/).count()) === 0
  await p.screenshot({ path: path.join(out, 'native-upgrade.png') })

  // 9. Signed out: password reset email points at the website
  await p.evaluate(() => { delete window.__fake.prefs['sb-localhost-auth-token'] })
  const p2 = await ctx.newPage()
  await p2.evaluate(() => {}).catch(() => {})
  await p2.goto(APP + '/'); await p2.waitForTimeout(500)
  await p2.evaluate(() => { for (const k of Object.keys(window.__fake.prefs)) delete window.__fake.prefs[k] })
  await p2.reload(); await p2.waitForTimeout(2000)
  const email = p2.locator('input[type="email"]')
  if (await email.count()) {
    await email.fill('tester@example.com')
    await p2.getByRole('button', { name: /Forgot password/ }).click(); await p2.waitForTimeout(1200)
  }
  st = await state()
  results.resetRedirect = (st.recover[0] || '').match(/redirect_to=([^&]+)/)?.[1] && decodeURIComponent((st.recover[0] || '').match(/redirect_to=([^&]+)/)[1])
  results.pageErrors = errors
  await browser.close()
  return results
}

async function runWeb() {
  // Same build, no bridge: the website must behave exactly as before.
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ ...devices['iPhone 14'] })
  await ctx.clock.install({ time: new Date('2026-11-16T12:00:00-06:00') })
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ body: '' }))
  await ctx.addInitScript(([s]) => { try { localStorage.setItem('sb-localhost-auth-token', s); localStorage.setItem('planner_a2hs_seen', '1') } catch {} }, [JSON.stringify(session)])
  const p = await ctx.newPage()
  await fetch(DB + '/__set?tier=free')
  await p.goto(APP + '/more'); await p.waitForTimeout(2500); await H.openFolds(p)
  const r = {}
  r.webUpgradeButton = (await p.getByRole('button', { name: 'Upgrade', exact: true }).count()) > 0
  r.webInstallCard = (await p.getByText('Install the planner for full-screen').count()) > 0
  r.webReminderNote = (await p.getByText('Add the planner to your Home Screen first').count()) > 0 // iPhone Safari, not installed
  await p.getByRole('button', { name: 'Upgrade', exact: true }).click().catch(() => {}); await p.waitForTimeout(500)
  r.webCheckoutLinks = ((await p.content()).match(/buy\.stripe\.com/g) || []).length
  await browser.close()
  return r
}

;(async () => {
  H.report({ native: await run(), web: await runWeb() })
})().catch((e) => { console.error(e); process.exit(1) })

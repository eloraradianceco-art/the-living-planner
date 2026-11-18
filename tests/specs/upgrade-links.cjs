// Ported from the session test scripts on 2026-11-16 (upgrade-link-test.cjs). Run with: npm test -- upgrade-links
// Website "Upgrade to Pro" (older links: Upgrade Monthly / Annually) → planner opens the upgrade sheet for free accounts only.
const H = require('../harness.cjs')
const { chromium, devices } = H
const APP = 'http://localhost:4830', DB = 'http://localhost:4831'
const UID = '11111111-2222-3333-4444-555555555555'
const session = { access_token: 'x.' + Buffer.from(JSON.stringify({ sub: UID, exp: 4102444800 })).toString('base64') + '.y', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'r', user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'tester@example.com' } }
const results = []; const check = (n, ok, x = '') => results.push((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : ''))
;(async () => {
  const b = await chromium.launch()
  const run = async (tier, url, signedIn = true, pre) => {
    await fetch(DB + '/__reset'); await fetch(DB + '/__set?tier=' + tier)
    const ctx = await b.newContext({ ...devices['iPhone 14'] })
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ body: '' }))
    await ctx.addInitScript(([s, signed, pre]) => { if (!sessionStorage.getItem('init')) { sessionStorage.setItem('init', '1'); localStorage.setItem('planner_a2hs_seen', '1'); localStorage.setItem('planner_onboarded', '1'); if (signed) localStorage.setItem('sb-localhost-auth-token', s); if (pre) localStorage.setItem('planner_upgrade_intent', pre) } }, [JSON.stringify(session), signedIn, pre])
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message))
    await p.goto(APP + url); await p.waitForTimeout(2500)
    return { ctx, p, errs }
  }
  let { ctx, p, errs } = await run('free', '/?upgrade=annual')
  let dlg = await p.getByRole('dialog').count() ? await p.getByRole('dialog').innerText() : ''
  check('Free account: upgrade sheet opens', /Pro/.test(dlg) && /\$49\.99 a year/.test(dlg) && !/\$7\.99|\$59\.99|Monthly/.test(dlg), dlg.replace(/\s+/g, ' ').slice(0, 120))
  check('Link cleaned from the address', !p.url().includes('upgrade='), p.url())
  await p.reload(); await p.waitForTimeout(2000)
  check('Opens only once', (await p.getByRole('dialog').count()) === 0)
  await ctx.close()
  ;({ ctx, p, errs } = await run('pro', '/?upgrade=monthly'))
  check('Pro account: nothing shown', (await p.getByRole('dialog').count()) === 0 && !(await p.evaluate(() => localStorage.getItem('planner_upgrade_intent'))))
  await ctx.close()
  ;({ ctx, p, errs } = await run('free', '/?upgrade=monthly', false))
  check('Signed out: wish kept for after sign-in (old monthly link → the yearly plan)', /annual/.test(await p.evaluate(() => localStorage.getItem('planner_upgrade_intent')) || ''))
  await ctx.close()
  ;({ ctx, p, errs } = await run('free', '/', true, JSON.stringify({ plan: 'monthly', at: Date.now() - 5000 })))
  check('After signing in: sheet opens', (await p.getByRole('dialog').count()) === 1)
  await ctx.close()
  ;({ ctx, p, errs } = await run('free', '/', true, JSON.stringify({ plan: 'monthly', at: Date.now() - 2 * 3600000 })))
  check('Old wish (2 h) ignored', (await p.getByRole('dialog').count()) === 0)
  check('No page errors', errs.length === 0, errs.join(' | '))
  await ctx.close(); await b.close()
  H.report({ failed: results.filter((x) => x.startsWith('FAIL')), checks: results.length })
})()

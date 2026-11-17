// The App Store app before sign-in: the welcome tour shows no prices or trials (Apple's rule: no web pricing),
// and "Forgot password" sends people to the website. Ported 2026-11-16 from tour-test.cjs and reset-test.cjs.
const H = require('../harness.cjs')
const { chromium, devices, fakeIphone, APP } = H
;(async () => {
  const r = {}; const errs = []
  const b = await chromium.launch()
  const open = async () => {
    const ctx = await b.newContext({ ...devices['iPhone 14'] })
    await ctx.clock.install({ time: new Date('2026-11-16T12:00:00-06:00') })
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (x) => x.fulfill({ body: '' }))
    await ctx.addInitScript(fakeIphone, { prefs: {} })
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message))
    await p.goto(APP + '/'); await p.waitForTimeout(2200)
    return { ctx, p }
  }
  // Tour
  let { ctx, p } = await open()
  const texts = [await p.locator('body').innerText()]
  await p.getByRole('button', { name: /See What's Inside/ }).click(); await p.waitForTimeout(700)
  for (let i = 1; i < 12; i++) {
    texts.push(await p.locator('body').innerText())
    const next = p.getByRole('button', { name: /Next|Continue|→/ }).first()
    if (!(await next.count())) break
    await next.click().catch(() => {}); await p.waitForTimeout(500)
  }
  r.tourPages = texts.length
  r.tourPriceMentions = [...new Set(texts.join('\n').split('\n').filter((l) => /free trial|\$\d|buy\.stripe/i.test(l)))]
  await ctx.close()
  // Forgot password
  ;({ ctx, p } = await open())
  await p.getByRole('button', { name: 'I already have an account' }).click(); await p.waitForTimeout(800)
  await p.locator('input[type="email"]').first().fill('tester@example.com')
  await p.getByRole('button', { name: /Forgot password/i }).click(); await p.waitForTimeout(1500)
  const st = await H.db.state()
  r.resetRedirect = decodeURIComponent(((st.recover[0] || '').match(/redirect_to=([^&]+)/) || [, ''])[1])
  r.resetConfirmationShown = (await p.getByText(/reset email sent|Check your inbox/i).count()) > 0
  r.errors = errs
  await b.close()
  H.report(r)
})().catch((e) => { console.error(e); process.exit(1) })

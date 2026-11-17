// Welcome → What's Inside → sign-up / sign-in screens on phone and iPad (signed out): Back stays reachable,
// Get Started clears the toolbar, the right form opens. Ported 2026-11-16 from tlp-auth-test.cjs.
const H = require('../harness.cjs')
const { chromium, devices, APP } = H
;(async () => {
  const b = await chromium.launch(); const out = {}; const errs = []
  for (const [name, dev] of [['phone', devices['iPhone 14']], ['ipad', devices['iPad Pro 11 landscape']]]) {
    const ctx = await b.newContext({ ...dev, deviceScaleFactor: 1 }); const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message))
    await p.route(/fonts\./, (r) => r.fulfill({ body: '' }))
    await p.goto(APP + '/'); await p.waitForTimeout(1500)
    await p.screenshot({ path: `${H.OUT}/${name}-welcome.png` })
    await p.getByRole('button', { name: /See What's Inside/ }).click(); await p.waitForTimeout(500)
    const r = {}
    r.backVisibleAtTop = await p.getByRole('button', { name: '← Back' }).evaluate((el) => Math.round(el.getBoundingClientRect().top))
    r.pageScrolls = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight)
    await p.screenshot({ path: `${H.OUT}/${name}-features.png` })
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await p.waitForTimeout(300)
    r.getStartedClearOfToolbar = await p.getByRole('button', { name: /Get Started/ }).evaluate((el) => Math.round(innerHeight - el.getBoundingClientRect().bottom))
    await p.screenshot({ path: `${H.OUT}/${name}-features-bottom.png` })
    await p.getByRole('button', { name: /Get Started/ }).click(); await p.waitForTimeout(500)
    r.afterGetStarted = (await p.locator('.auth-card h1').innerText()) + ' / ' + (await p.locator('.auth-card .primary-btn').innerText())
    r.scrollTopAfter = await p.evaluate(() => scrollY)
    await p.getByRole('button', { name: '← Back' }).click(); await p.waitForTimeout(300)
    await p.getByRole('button', { name: /I already have an account/ }).click(); await p.waitForTimeout(300)
    r.alreadyHave = await p.locator('.auth-card h1').innerText()
    await p.screenshot({ path: `${H.OUT}/${name}-signin.png` })
    out[name] = r; await ctx.close()
  }
  // Exact pixel positions vary with the machine's fonts, so record what matters about them
    for (const k of ['phone', 'ipad']) { const v = out[k]; v.backVisibleAtTop = v.backVisibleAtTop >= 0 && v.backVisibleAtTop < 120; v.pageScrolls = v.pageScrolls > 0; v.getStartedClearOfToolbar = v.getStartedClearOfToolbar >= 40 }
    out.errors = errs; H.report(out); await b.close()
})().catch((e) => { console.error(e); process.exit(1) })

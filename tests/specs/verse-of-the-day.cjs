// Ported from the session test scripts on 2026-11-16 (votd-test.cjs). Run with: npm test -- verse-of-the-day
// Verse of the Day save: Pro saves into Scripture journal with text, shows confirmation, no duplicates; old `verse` entries show; free sees lock.
const H = require('../harness.cjs')
const { chromium, devices } = H
const APP = 'http://localhost:4830', DB = 'http://localhost:4831', UID = '11111111-2222-3333-4444-555555555555'
const session = { access_token: 'x.' + Buffer.from(JSON.stringify({ sub: UID, exp: 4102444800 })).toString('base64') + '.y', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'r', user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 't@e.com' } }
const out = []; const check = (n, ok, x = '') => out.push((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : ''))
;(async () => {
  for (const tier of ['pro', 'free']) {
    await fetch(DB + '/__reset'); await fetch(DB + '/__set?tier=' + tier)
    // an older verse-of-the-day save that used the `verse` field
    await fetch(DB + '/rest/v1/faith_data', { method: 'POST', body: JSON.stringify([{ user_id: UID, data_key: 'scriptures', data_value: [{ id: 1, verse: 'Older saved verse text', reference: 'Psalm 1:1', date: '2026-11-01' }], updated_at: '2026-11-01T00:00:00Z' }]) })
    const b = await chromium.launch()
    const ctx = await b.newContext({ ...devices['iPhone 14'], timezoneId: 'America/Chicago' })
    await ctx.route(/fonts\./, (x) => x.fulfill({ body: '' }))
    await ctx.addInitScript((s) => { if (sessionStorage.getItem('i')) return; sessionStorage.setItem('i', '1'); localStorage.setItem('sb-localhost-auth-token', s); localStorage.setItem('planner_a2hs_seen', '1'); localStorage.setItem('planner_onboarded', '1') }, JSON.stringify(session))
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message))
    await p.clock.install({ time: new Date('2026-11-14T07:00:00-06:00') })
    await p.goto(APP + '/faith?tab=devotional'); await p.waitForTimeout(1500)
    const ref = (await p.locator('text=/^— /').first().innerText()).replace(/^— /, '').trim()
    if (tier === 'pro') {
      await p.getByRole('button', { name: '+ Save to Scripture' }).click(); await p.waitForTimeout(400)
      check('Pro: confirmation shows', await p.getByRole('status').filter({ hasText: 'Saved to your Scripture journal' }).count() === 1)
      check('Pro: save button gone (no duplicate)', await p.getByRole('button', { name: '+ Save to Scripture' }).count() === 0)
      await p.screenshot({ path: H.OUT + '/free-shots/votd-saved.png' })
      await p.getByRole('button', { name: 'View →' }).click(); await p.waitForTimeout(600)
      const main = await p.locator('main').innerText()
      check('Pro: View opens Scripture tab', /Scripture Journal/i.test(main))
      check('Pro: new verse shows reference + text, listed first', main.indexOf(ref) > -1 && main.indexOf(ref) < main.indexOf('Psalm 1:1'), ref)
      check('Pro: older verse-field entry shows its text', /Older saved verse text/.test(main))
      const st = await (await fetch(DB + '/__state')).json()
      const row = (st.faithData || []).find((r) => r.data_key === 'scriptures')
      check('Pro: synced to account (faith_data scriptures)', row && row.data_value.length === 2 && row.data_value[0].text && row.data_value[0].reference === ref, JSON.stringify(row?.data_value?.[0] || {}).slice(0, 120))
      await p.screenshot({ path: H.OUT + '/free-shots/votd-journal.png' })
      await p.goto(APP + '/faith?tab=devotional'); await p.waitForTimeout(1200)
      check('Pro: stays saved after reload', await p.getByRole('status').filter({ hasText: 'Saved' }).count() === 1)
    } else {
      const lock = p.getByRole('button', { name: 'Save to Scripture journal (Pro)' })
      check('Free: lock button shown', await lock.count() === 1)
      await lock.click(); await p.waitForTimeout(300)
      check('Free: opens upgrade card', await p.locator('[role="dialog"][aria-modal="true"]').filter({ hasText: 'Annual' }).count() === 1)
    }
    check(tier + ': no page errors', errs.length === 0, errs.join(' | '))
    await b.close()
  }
  H.report({ failed: out.filter((x) => x.startsWith('FAIL')), checks: out.length })
})()

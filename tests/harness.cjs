// Shared pieces for the planner's browser tests (see tests/README.md).
// Each spec is a plain Node script: it drives the built app in Chromium against the fake database,
// collects what it saw into one object, and calls report(result). The runner compares that object
// with the spec's saved snapshot (tests/snapshots/<spec>.json); any difference fails the run.
const fs = require('fs'), path = require('path')
const { chromium, devices } = require('playwright')

const APP = process.env.TEST_APP || 'http://localhost:4830'
const DB = process.env.TEST_DB || 'http://localhost:4831'
const UID = '11111111-2222-3333-4444-555555555555'
// Where a spec may write screenshots (kept by CI when a run fails)
const OUT = process.env.TEST_OUT || path.join(__dirname, 'results')
fs.mkdirSync(OUT, { recursive: true })

// A signed-in session the app accepts (the fake database accepts any token)
const session = {
  access_token: 'x.' + Buffer.from(JSON.stringify({ sub: UID, exp: 4102444800 })).toString('base64') + '.y',
  token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'r',
  user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'tester@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
}
const SESSION_KEY = 'sb-localhost-auth-token'

// Fake database helpers
const db = {
  state: async () => (await fetch(DB + '/__state')).json(),
  reset: () => fetch(DB + '/__reset'),
  tier: (t) => fetch(DB + '/__set?tier=' + t),
  apple: (q) => fetch(DB + '/__apple?' + q),
  post: (table, rows) => fetch(`${DB}/rest/v1/${table}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rows) }),
}

// Local calendar date helpers (YYYY-MM-DD)
const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d) }

// The result object goes to the file the runner names (or stdout when a spec is run by hand)
function report(result) {
  const json = JSON.stringify(result, null, 1)
  if (process.env.TEST_RESULT) fs.writeFileSync(process.env.TEST_RESULT, json)
  else console.log(json)
}

// Simulated iPhone/iPad App Store app: installed before the app loads, it mimics the bridge
// that the iOS app injects (window.webkit.messageHandlers.bridge + Capacitor.nativePromise/nativeCallback),
// so the app runs its App Store code paths. Pass as ctx.addInitScript(fakeIphone, { prefs, store }).
function fakeIphone({ prefs = {}, store = null } = {}) {
  const PLUGINS = {
    Preferences: ['get', 'set', 'remove', 'keys', 'clear'],
    PushNotifications: ['checkPermissions', 'requestPermissions', 'register', 'unregister', 'getDeliveredNotifications', 'removeAllDeliveredNotifications', 'createChannel', 'removeAllListeners'],
    StatusBar: ['setStyle', 'setBackgroundColor', 'show', 'hide', 'setOverlaysWebView', 'getInfo'],
    Share: ['share', 'canShare'],
    Filesystem: ['writeFile', 'readFile', 'deleteFile', 'mkdir', 'getUri', 'stat'],
    App: ['exitApp', 'getInfo', 'getState', 'minimizeApp', 'removeAllListeners'],
    Purchases: ['configure', 'logIn', 'logOut', 'getOfferings', 'purchasePackage', 'restorePurchases', 'getCustomerInfo', 'showManageSubscriptions', 'setLogLevel', 'isConfigured'],
  }
  const f = window.__fake = { prefs: { ...prefs }, calls: [], listeners: {}, push: 'prompt', n: 0, store }
  window.webkit = { messageHandlers: { bridge: { postMessage() {} } } }
  window.Capacitor = window.Capacitor || {}
  window.Capacitor.PluginHeaders = Object.entries(PLUGINS).map(([name, ms]) => ({
    name, methods: [...ms.map((m) => ({ name: m, rtype: 'promise' })), { name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'promise' }],
  }))
  f.emit = (plugin, event, data) => (f.listeners[plugin + ':' + event] || []).forEach((l) => l.cb(data))
  window.Capacitor.nativeCallback = (plugin, method, options, cb) => {
    const id = 'cb' + (++f.n)
    if (method === 'addListener') (f.listeners[plugin + ':' + options.eventName] ||= []).push({ id, cb })
    return id
  }
  window.Capacitor.nativePromise = async (plugin, method, o = {}) => {
    f.calls.push(plugin + '.' + method + (plugin === 'Filesystem' || plugin === 'Share' || plugin === 'StatusBar' ? ' ' + JSON.stringify({ ...o, data: o.data ? `[${o.data.length} chars]` : undefined }) : ''))
    if (method === 'removeListener') { for (const k in f.listeners) f.listeners[k] = f.listeners[k].filter((l) => l.id !== o.callbackId); return }
    if (plugin === 'Preferences') {
      if (method === 'get') return { value: o.key in f.prefs ? f.prefs[o.key] : null }
      if (method === 'set') { f.prefs[o.key] = o.value; return }
      if (method === 'remove') { delete f.prefs[o.key]; return }
      return {}
    }
    if (plugin === 'PushNotifications') {
      if (method === 'checkPermissions') return { receive: f.push }
      if (method === 'requestPermissions') { f.push = 'granted'; return { receive: 'granted' } }
      if (method === 'register') { setTimeout(() => f.emit('PushNotifications', 'registration', { value: 'A1B2C3D4'.repeat(8) }), 50); return }
      return {}
    }
    if (plugin === 'Filesystem' && method === 'writeFile') return { uri: 'file:///var/mobile/Caches/' + o.path }
    if (plugin === 'Purchases' && f.store && typeof f.store[method] === 'function') return f.store[method](o)
    return {}
  }
}

// Phone and iPad shapes used across specs
const DEVICES = {
  phone: devices['iPhone 14'],
  ipad: devices['iPad Pro 11 landscape'],
  ipadPortrait: devices['iPad Pro 11'],
}

module.exports = { chromium, devices, DEVICES, APP, DB, UID, OUT, session, SESSION_KEY, db, report, ymd, addDays, fakeIphone }

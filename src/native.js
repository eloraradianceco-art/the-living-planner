// The Living Planner inside the App Store app (Capacitor).
// On the website every check here is false and every helper is unused, so the web app is unchanged.
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { Preferences } from '@capacitor/preferences'
import { PushNotifications } from '@capacitor/push-notifications'
import { Share } from '@capacitor/share'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { StatusBar, Style } from '@capacitor/status-bar'
import { Purchases } from '@revenuecat/purchases-capacitor'
import { CapacitorCalendar } from '@ebarooni/capacitor-calendar'

export const isNative = Capacitor.isNativePlatform()
export const nativePlatform = Capacitor.getPlatform() // 'ios' | 'android' | 'web'

// The app runs from files on the phone, so emails and shared links point at the website.
export const WEB_ORIGIN = 'https://planner.eloraradiance.com'

// Buying Pro inside the phone app: Apple in-app purchase through RevenueCat (decided 2026-11-15).
// It turns on by itself once REVENUECAT_IOS_KEY holds the app's public RevenueCat key (starts with "appl_";
// it is meant to ship inside the app). Until then the app shows no prices or buy buttons, and people who
// already have Pro sign in and have it. Setup steps: claude/in-app-purchases.md in the project.
export const REVENUECAT_IOS_KEY = import.meta.env.VITE_REVENUECAT_IOS_KEY ?? 'appl_SbDdDUDuQWFLokHdecbgNhVYWIt'  // public key (safe to ship); the tests override it
export const NATIVE_PURCHASES = isNative && nativePlatform === 'ios' && /^appl_/.test(REVENUECAT_IOS_KEY)
export const purchasesInApp = !isNative || NATIVE_PURCHASES

// ── Apple in-app purchase (RevenueCat) ───────────────────────────────────
// Product (App Store Connect, subscription group "Living Planner Pro"): planner_pro_yearly ($49.99 a year).
// RevenueCat: entitlement "pro", current offering with the Annual package. One plan since 2026-11-18.
// Purchases are tied to the planner account (RevenueCat app user id = account id), so Pro follows the account,
// and the planner database is updated by the store-sync function (webhook + a check right after buying).
export const PRO_ENTITLEMENT = 'pro'
let storeReady = null
let storeUser = null
export async function storeSignIn(userId) {
  if (!NATIVE_PURCHASES || !userId) return false
  try {
    if (!storeReady) storeReady = Purchases.configure({ apiKey: REVENUECAT_IOS_KEY, appUserID: userId }).then(() => { storeUser = userId; return true })
    await storeReady
    // Also after a sign-out (storeUser is null then): without this the next person to sign in stayed anonymous in the
    // store, so Apple took their purchase but it was never tied to their account.
    if (storeUser !== userId) await Purchases.logIn({ appUserID: userId })
    storeUser = userId
    return true
  } catch { storeReady = null; return false }
}
export async function storeSignOut() {
  if (!NATIVE_PURCHASES || !storeReady) return
  try { await storeReady; await Purchases.logOut() } catch {} // logOut fails for anonymous users; nothing to undo
  storeUser = null
}
const proActive = (info) => !!info?.entitlements?.active?.[PRO_ENTITLEMENT]
// The yearly package with Apple's own price text for this person's country
export async function storePlans(userId) {
  if (!(await storeSignIn(userId))) return null
  const o = await Purchases.getOfferings()
  const cur = o?.current
  if (!cur) return null
  const pick = (type, id) => cur.availablePackages?.find((p) => p.packageType === type || p.identifier === id) || null
  const plan = (pkg) => pkg && { pkg, id: pkg.product?.identifier, price: pkg.product?.priceString, amount: pkg.product?.price, title: pkg.product?.title }
  return { annual: plan(pick('ANNUAL', '$rc_annual')) }
}
// 'pro' | 'cancelled' | 'pending' (Ask to Buy, etc.) | { error }
export async function storeBuy(userId, pkg) {
  if (!(await storeSignIn(userId))) return { error: 'The App Store isn\'t available right now.' }
  try {
    const r = await Purchases.purchasePackage({ aPackage: pkg })
    return proActive(r?.customerInfo) ? 'pro' : 'pending'
  } catch (e) {
    if (e?.userCancelled || String(e?.code) === '1') return 'cancelled'        // PURCHASE_CANCELLED_ERROR
    if (String(e?.code) === '20') return 'pending'                               // PAYMENT_PENDING_ERROR (Ask to Buy)
    return { error: e?.message || 'The purchase didn\'t go through.' }
  }
}
// true when this Apple ID has Pro to restore onto the signed-in account
export async function storeRestore(userId) {
  if (!(await storeSignIn(userId))) return false
  try { return proActive((await Purchases.restorePurchases())?.customerInfo) } catch { return false }
}
// Apple's subscription settings (cancel, change plan): iOS opens this address in the App Store
export const APPLE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions'
export function storeManage() {
  try { window.open(APPLE_SUBSCRIPTIONS_URL, '_blank') } catch {}
}

// Keeps the sign-in in the phone's own storage, which iOS never clears on its own.
export const nativeAuthStorage = {
  getItem: async (key) => (await Preferences.get({ key })).value,
  setItem: async (key, value) => { await Preferences.set({ key, value }) },
  removeItem: async (key) => { await Preferences.remove({ key }) },
}

// Saves a file and opens the share sheet (Save to Files, Mail, AirDrop…).
export async function nativeShareFile(content, fileName, title) {
  const { uri } = await Filesystem.writeFile({
    path: fileName, data: content, directory: Directory.Cache, encoding: Encoding.UTF8,
  })
  try { await Share.share({ title, files: [uri], dialogTitle: title }); return 'shared' }
  catch { return 'cancelled' }
}

// Light status-bar text over the planner's dark header.
export function setupNativeShell() {
  if (!isNative) return
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {})
}

// ── Reminders (Apple Push Notification service) ─────────────────────────
// The planner's reminder service sends the same reminders as on the web; this registers the
// phone with Apple and saves its notification token to the account (register_native_push).
const TOKEN_KEY = 'planner_apns_token'
export const nativePushSupported = isNative && nativePlatform === 'ios'

const mapPermission = (p) => (p?.receive === 'granted' ? 'granted' : p?.receive === 'denied' ? 'denied' : 'default')

export const NativePush = {
  async permission() {
    if (!nativePushSupported) return 'unsupported'
    try { return mapPermission(await PushNotifications.checkPermissions()) } catch { return 'default' }
  },

  async requestPermission() {
    if (!nativePushSupported) return 'unsupported'
    try { return mapPermission(await PushNotifications.requestPermissions()) } catch { return 'default' }
  },

  // Registers with Apple and resolves with the device token (or null on failure).
  register() {
    if (!nativePushSupported) return Promise.resolve(null)
    return new Promise((resolve) => {
      let done = false
      const finish = (v) => { if (done) return; done = true; ok.then((h) => h.remove()); bad.then((h) => h.remove()); resolve(v) }
      const ok = PushNotifications.addListener('registration', (t) => finish(t?.value || null))
      const bad = PushNotifications.addListener('registrationError', () => finish(null))
      PushNotifications.register().catch(() => finish(null))
      setTimeout(() => finish(null), 15000)
    })
  },

  async savedToken() {
    try { return (await Preferences.get({ key: TOKEN_KEY })).value } catch { return null }
  },
  async rememberToken(token) {
    try { if (token) await Preferences.set({ key: TOKEN_KEY, value: token }); else await Preferences.remove({ key: TOKEN_KEY }) } catch {}
  },
}

// ── Apple Calendar on this iPhone/iPad (2026-11-17) ──────────────────────
// Reads the calendars the person already has on the device (iCloud, plus any Google / Outlook / work account
// added in iOS Settings) so the planner can show them next to tasks. Everything stays on the device: nothing
// here talks to the planner database. The planner changes a calendar only when the person asks it to.
// Plugin notes (@ebarooni/capacitor-calendar 8.10): modifyEvent() rewrites an event's repeat rule, and
// delete / edit work on the FIRST event of a series, so repeating events are never changed from here;
// the app sends people to Apple Calendar for those (see lib/deviceCalendar.js).
export const deviceCalendarSupported = isNative && nativePlatform === 'ios'
const calState = (r) => (r?.result === 'granted' ? 'granted' : r?.result === 'denied' ? 'denied' : 'prompt')
export const NativeCalendar = {
  // 'granted' | 'denied' | 'prompt' | 'unsupported'
  async status() {
    if (!deviceCalendarSupported) return 'unsupported'
    try { return calState(await CapacitorCalendar.checkPermission({ scope: 'readCalendar' })) } catch { return 'prompt' }
  },
  async request() {
    if (!deviceCalendarSupported) return 'unsupported'
    try { return calState(await CapacitorCalendar.requestFullCalendarAccess()) } catch { return 'denied' }
  },
  async calendars() {
    const { result } = await CapacitorCalendar.listCalendars()
    return (result || []).map((c) => ({
      id: c.id, title: c.title || 'Calendar', color: c.color || null,
      writable: c.allowsContentModifications !== false && c.isImmutable !== true && c.isSubscribed !== true,
      account: c.source?.title || '',
    }))
  },
  async events(fromMs, toMs) {
    const { result } = await CapacitorCalendar.listEventsInRange({ from: fromMs, to: toMs })
    return result || []
  },
  // options: { title, startDate, endDate, isAllDay, location, description, calendarId, recurrence }
  async create(options) { return (await CapacitorCalendar.createEvent(options))?.id || null },
  // Only for events that don't repeat (see the note above)
  async move(id, startMs, endMs) { await CapacitorCalendar.modifyEvent({ id, startDate: startMs, endDate: endMs }) },
  async remove(id) { await CapacitorCalendar.deleteEvent({ id }) },
  // Apple's own edit sheet, shown over the planner: 'saved' | 'deleted' | 'canceled' | null
  async editWithApple(id) { return (await CapacitorCalendar.modifyEventWithPrompt({ id }))?.result || null },
  async openInCalendar(ms) { await CapacitorCalendar.openCalendar({ date: ms }) },
}

// Tapping a reminder opens the page it is about (the reminder carries a path such as /calendar).
export function onNativeReminderTap(navigate) {
  if (!nativePushSupported) return () => {}
  const h = PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
    const url = a?.notification?.data?.url
    if (typeof url === 'string' && url.startsWith('/')) navigate(url)
  })
  return () => { h.then((x) => x.remove()) }
}

// Android hardware back button: go back in the planner, or leave the app from the home screen.
export function onNativeBack(goBack) {
  if (!isNative || nativePlatform !== 'android') return () => {}
  const h = App.addListener('backButton', ({ canGoBack }) => { if (canGoBack) goBack(); else App.exitApp() })
  return () => { h.then((x) => x.remove()) }
}

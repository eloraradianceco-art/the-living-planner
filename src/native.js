// The Living Planner inside the App Store app (Capacitor).
// On the website every check here is false and every helper is unused, so the web app is unchanged.
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { Preferences } from '@capacitor/preferences'
import { PushNotifications } from '@capacitor/push-notifications'
import { Share } from '@capacitor/share'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { StatusBar, Style } from '@capacitor/status-bar'

export const isNative = Capacitor.isNativePlatform()
export const nativePlatform = Capacitor.getPlatform() // 'ios' | 'android' | 'web'

// The app runs from files on the phone, so emails and shared links point at the website.
export const WEB_ORIGIN = 'https://planner.eloraradiance.com'

// Buying Pro inside the phone app. Off until the App Store purchase decision is made
// (Apple in-app purchase, or a US-only link to the website checkout). While off, the app
// shows no prices, trials or checkout links; people who already have Pro sign in and have it.
export const NATIVE_PURCHASES = false
export const purchasesInApp = !isNative || NATIVE_PURCHASES

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

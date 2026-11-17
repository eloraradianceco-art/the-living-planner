// Reminders on this device: web push for the website, Apple notifications in the App Store app.
import { isNative, NativePush, nativePushSupported } from '../native.js'
import { hasSupabaseEnv, supabase } from './supabase.js'

// ── Push Notification System ───────────────
// Reminders are sent by the Supabase function `push-reminders` every 5 minutes,
// so they arrive even when the planner is closed. This client only asks for
// permission and registers the device.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}
const bufToB64Url = (buf) => {
  if (!buf) return ''
  const bytes = new Uint8Array(buf); let str = ''
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i])
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const isIOS = () => typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

// In the App Store app the same reminders arrive through Apple's notification service (see native.js).
const PlannerPush = {
  async isSupported() {
    if (isNative) return nativePushSupported
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  },

  // 'granted' | 'denied' | 'default'
  async permission() {
    if (isNative) return NativePush.permission()
    try { return typeof Notification === 'undefined' ? 'default' : Notification.permission } catch { return 'default' }
  },

  async requestPermission() {
    if (!(await this.isSupported())) return 'unsupported'
    if (isNative) return NativePush.requestPermission()
    return Notification.requestPermission()
  },

  async registerSW() {
    if (!('serviceWorker' in navigator)) return null
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      await navigator.serviceWorker.ready
      return reg
    } catch (e) { console.warn('SW registration failed:', e); return null }
  },

  async publicKey() {
    try { const c = localStorage.getItem('planner.vapidPub'); if (c) return c } catch {}
    if (!hasSupabaseEnv) return null
    let key = null
    const { data } = await supabase.from('app_config').select('value').eq('key', 'vapid_public_key').maybeSingle()
    key = data?.value || null
    if (!key) {
      const { data: init } = await supabase.functions.invoke('push-reminders', { body: { action: 'init' } })
      key = init?.publicKey || null
    }
    if (key) { try { localStorage.setItem('planner.vapidPub', key) } catch {} }
    return key
  },

  // Subscribe this device (or refresh it) and save it to the user's account.
  async subscribe() {
    if (!hasSupabaseEnv) return null
    if (isNative) {
      const token = await NativePush.register()
      if (!token) return null
      const { error } = await supabase.rpc('register_native_push', { p_token: token, p_platform: 'ios', p_user_agent: navigator.userAgent.slice(0, 200) })
      if (error) { console.warn('Native push register failed:', error.message); return null }
      await NativePush.rememberToken(token)
      return { token }
    }
    const reg = await this.registerSW()
    if (!reg) return null
    const key = await this.publicKey()
    if (!key) return null
    try {
      let sub = await reg.pushManager.getSubscription()
      const current = sub?.options?.applicationServerKey ? bufToB64Url(sub.options.applicationServerKey) : null
      if (sub && current && current !== key) { await sub.unsubscribe(); sub = null } // made with an old key
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) })
      const j = sub.toJSON()
      const { error } = await supabase.rpc('register_push_subscription', {
        p_endpoint: j.endpoint, p_p256dh: j.keys?.p256dh, p_auth: j.keys?.auth, p_user_agent: navigator.userAgent.slice(0, 200),
      })
      if (error) throw error
      try { localStorage.removeItem('planner.pushSub') } catch {}
      return sub
    } catch (e) { console.warn('Push subscribe failed:', e); return null }
  },

  async unsubscribe() {
    if (isNative) {
      const token = await NativePush.savedToken()
      if (token && hasSupabaseEnv) await supabase.from('push_subscriptions').delete().eq('endpoint', 'apns:' + token.toLowerCase())
      await NativePush.rememberToken(null)
      return
    }
    const reg = await navigator.serviceWorker.getRegistration('/sw.js')
    const sub = reg && await reg.pushManager.getSubscription()
    if (sub) {
      if (hasSupabaseEnv) await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
      await sub.unsubscribe()
    }
  },

  async deviceConnected() {
    if (isNative) return Boolean(await NativePush.savedToken()) && (await NativePush.permission()) === 'granted'
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js')
      return Boolean(reg && await reg.pushManager.getSubscription())
    } catch { return false }
  },

  async sendTest() {
    const { data, error } = await supabase.functions.invoke('push-reminders', { body: { action: 'test' } })
    if (error) throw error
    return data
  },
}

export { isIOS, PlannerPush }

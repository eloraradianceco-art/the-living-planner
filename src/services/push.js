// ── Push Notification Service ──────────────────────────────────────────
const VAPID_PUBLIC_KEY = 'YI0UW1Ky1eXea1RFPVhDrHjkSV6se1QHcOX9JmztAa_M4GT9rnHJCq-LcrBgJR4GFNohKQDz9sSKo2xwLlwSKQ'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

const PlannerPush = {
  async isSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  },

  async getPermission() {
    return Notification.permission // 'default' | 'granted' | 'denied'
  },

  async requestPermission() {
    if (!(await this.isSupported())) return 'unsupported'
    const result = await Notification.requestPermission()
    return result
  },

  async registerSW() {
    if (!('serviceWorker' in navigator)) return null
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      await navigator.serviceWorker.ready
      return reg
    } catch(e) {
      console.warn('SW registration failed:', e)
      return null
    }
  },

  async subscribe() {
    const reg = await this.registerSW()
    if (!reg) return null
    try {
      const existing = await reg.pushManager.getSubscription()
      if (existing) return existing
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      })
      // Save subscription to localStorage for use when scheduling
      localStorage.setItem('planner.pushSub', JSON.stringify(subscription))
      return subscription
    } catch(e) {
      console.warn('Push subscribe failed:', e)
      return null
    }
  },

  async unsubscribe() {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js')
    if (!reg) return
    const sub = await reg.pushManager.getSubscription()
    if (sub) await sub.unsubscribe()
    localStorage.removeItem('planner.pushSub')
  },

  async sendLocal(title, body, options = {}) {
    // Send a local notification (no server needed) for immediate alerts
    if (Notification.permission !== 'granted') return
    const reg = await navigator.serviceWorker.ready
    reg.showNotification(title, {
      body,
      icon: '/planner-icon.png',
      badge: '/planner-icon.png',
      vibrate: [100, 50, 100],
      ...options
    })
  },

  scheduleCheck(tasks, habits, goals, settings) {
    // Run on app load — check what needs notifying today
    if (Notification.permission !== 'granted') return
    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    const hour = now.getHours()

    const notifSettings = settings?.notifications || {}

    // Morning habit reminder (8am)
    if (notifSettings.habits && hour >= 8 && hour < 9) {
      const todayKey = 'planner.notif.habits.' + today
      if (!localStorage.getItem(todayKey)) {
        const pendingHabits = habits.filter(h => h.title || h.name)
        if (pendingHabits.length > 0) {
          this.sendLocal('🔁 Habit Check-In', `You have ${pendingHabits.length} habits to complete today.`, { tag: 'habits-' + today, data: { url: '/habits' } })
          localStorage.setItem(todayKey, '1')
        }
      }
    }

    // Task reminders (9am)
    if (notifSettings.tasks && hour >= 9 && hour < 10) {
      const todayKey = 'planner.notif.tasks.' + today
      if (!localStorage.getItem(todayKey)) {
        const dueTasks = tasks.filter(t => t.date === today && !t.completed)
        if (dueTasks.length > 0) {
          this.sendLocal('✓ Tasks Due Today', `${dueTasks.length} task${dueTasks.length > 1 ? 's' : ''} due: ${dueTasks[0].title}${dueTasks.length > 1 ? ` +${dueTasks.length-1} more` : ''}`, { tag: 'tasks-' + today, data: { url: '/tasks' } })
          localStorage.setItem(todayKey, '1')
        }
      }
    }

    // Evening reflection (7pm)
    if (notifSettings.reflection && hour >= 19 && hour < 20) {
      const todayKey = 'planner.notif.reflect.' + today
      if (!localStorage.getItem(todayKey)) {
        this.sendLocal('📖 Evening Reflection', 'Take 5 minutes to journal and plan tomorrow.', { tag: 'reflect-' + today, data: { url: '/growth' } })
        localStorage.setItem(todayKey, '1')
      }
    }

    // Overdue tasks (anytime)
    if (notifSettings.overdue) {
      const overdue = tasks.filter(t => t.date && t.date < today && !t.completed)
      if (overdue.length > 0) {
        const overdueKey = 'planner.notif.overdue.' + today
        if (!localStorage.getItem(overdueKey)) {
          this.sendLocal('⚠ Overdue Tasks', `${overdue.length} overdue task${overdue.length > 1 ? 's' : ''} need your attention.`, { tag: 'overdue-' + today, data: { url: '/tasks' } })
          localStorage.setItem(overdueKey, '1')
        }
      }
    }

    // Faith morning reminder (6am)
    if (notifSettings.faith && hour >= 6 && hour < 7) {
      const todayKey = 'planner.notif.faith.' + today
      if (!localStorage.getItem(todayKey)) {
        this.sendLocal('✝ Morning Devotional', 'Start your day in the Word. Your devotional is waiting.', { tag: 'faith-' + today, data: { url: '/faith' } })
        localStorage.setItem(todayKey, '1')
      }
    }

    // Birthday reminders (8am)
    if (notifSettings.birthdays) {
      const todayKey = 'planner.notif.bday.' + today
      if (!localStorage.getItem(todayKey) && hour >= 8 && hour < 9) {
        // Birthday check done in app with actual birthday data
        localStorage.setItem(todayKey + '.checked', '1')
      }
    }
  }
}


const TODAY = getTodayString()


export { PlannerPush, urlBase64ToUint8Array, VAPID_PUBLIC_KEY }

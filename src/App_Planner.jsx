import React, { useEffect, useMemo, useState } from 'react'
import { onNativeReminderTap } from './native.js'
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import { TrendingUp } from 'lucide-react'
import { hasSupabaseEnv } from './lib/supabase.js'
import { DEVICE_TIME_ZONE, getTodayString, TODAY, shiftEnd } from './lib/dates.js'
import { PlannerPush } from './lib/push.js'
import { cleanPlace } from './components/Place.jsx'
import { takeUpgradeIntent, FREE_LIMITS, activeCount, useSubscription } from './lib/subscription.js'
import { AuthProvider, useAuth } from './auth/AuthContext.jsx'
import { usePlannerData } from './lib/usePlannerData.js'
import { AuthGate, AuthPage } from './auth/AuthPage.jsx'
import { Layout, StatusBanner, ToastStack } from './shell/Layout.jsx'
import { labels, QuickAddModal } from './components/QuickAddModal.jsx'
import { HomePage } from './pages/HomePage.jsx'
import { TasksPage } from './pages/TasksPage.jsx'
import { CalendarPage } from './pages/CalendarPage.jsx'
import { ProjectsPage } from './pages/ProjectsPage.jsx'
import { WelcomeProBanner, ProSectionGate, UpgradeCard } from './components/Pro.jsx'
import { isStandalone, A2HSModal } from './components/A2HS.jsx'
import { CalculatorPage } from './pages/CalculatorPage.jsx'
import { FinancePage } from './pages/finance/FinancePage.jsx'
import { HealthWellnessPage } from './pages/wellness/WellnessPage.jsx'
import { ProductivityPage } from './pages/ProductivityPage.jsx'
import { LifestylePage } from './pages/lifestyle/LifestylePage.jsx'
import { HabitsPage } from './pages/HabitsPage.jsx'
import { GoalsPage } from './pages/GoalsPage.jsx'
import { GrowthPage } from './pages/GrowthPage.jsx'
import { MorePage } from './pages/more/MorePage.jsx'
import { FaithPage } from './pages/faith/FaithPage.jsx'
import { deviceCal } from './lib/deviceCalendar.js'

const modalEmpty = { open: false, type: 'task', mode: 'create', item: null }

function ScrollToTop() {
  const location = useLocation()
  React.useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])
  return null
}

function PlannerApp() {
  const { tasks, goals, projects, expenses, notes, events, habits, habitLogs, budget, profile, settings, scores, scoreDetails, scoreHistory, scoreSeries, loading, syncing, error, saveItem, deleteItem, toggleTask, toggleHabit, saveSteps, updateBudget, updateProfile, updateSettings } = usePlannerData()
  const { user } = useAuth()
  // Places used before (newest first) — suggested in the Location field
  const recentPlaces = useMemo(() => {
    const seen = new Map()
    for (const it of [...events, ...tasks]) {
      const p = cleanPlace(it.location); if (!p) continue
      const key = p.toLowerCase(), when = it.updated_at || it.created_at || ''
      if (!seen.has(key) || seen.get(key).when < when) seen.set(key, { p, when })
    }
    return [...seen.values()].sort((a, b) => String(b.when).localeCompare(String(a.when))).slice(0, 15).map((x) => x.p)
  }, [events, tasks])
  // Subscription
  const subscription = useSubscription(user)
  const [showA2HS, setShowA2HS] = useState(() => {
    try { return !isStandalone() && !localStorage.getItem('planner_a2hs_seen') } catch { return false }
  })
  const dismissA2HS = () => { try { localStorage.setItem('planner_a2hs_seen', '1') } catch {} ; setShowA2HS(false) }
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [upgradeContext, setUpgradeContext] = useState({title: '', message: ''})
  const triggerUpgrade = (title, message) => {
    setUpgradeContext({title, message})
    setShowUpgrade(true)
  }
  // The website's "Upgrade Monthly / Upgrade Annually" buttons open planner.eloraradiance.com/?upgrade=monthly|annual.
  // The wish is kept through sign-in (readUpgradeIntent); once the tier is confirmed, free accounts see the plans.
  React.useEffect(() => {
    if (!user || !subscription.checked) return
    const intent = takeUpgradeIntent()
    if (intent && !subscription.isPro) triggerUpgrade('Upgrade to Pro', 'Everything in The Living Planner, with no limits. Pick monthly or yearly.')
  }, [user?.id, subscription.checked])

  const [modalState, setModalState] = useState(modalEmpty)
  const [toasts, setToasts] = useState([])
  // TODAY is fixed when the app loads. Home Screen apps can sit in the background overnight, so when the app
  // comes back on a new day, reload it (pending saves were already sent when it went to the background). 2026-11-13
  useEffect(() => {
    const check = () => { if (document.visibilityState === 'visible' && getTodayString() !== TODAY) window.location.reload() }
    document.addEventListener('visibilitychange', check); window.addEventListener('pageshow', check); window.addEventListener('focus', check)
    return () => { document.removeEventListener('visibilitychange', check); window.removeEventListener('pageshow', check); window.removeEventListener('focus', check) }
  }, [])

  // New accounts start on the database default (Chicago). Before onboarding is done, match the device's zone
  // so reminders arrive on the person's own clock. Existing accounts are never changed automatically.
  const tzSynced = React.useRef(false)
  useEffect(() => {
    if (tzSynced.current || loading || !user || !hasSupabaseEnv || settings?.onboardingComplete) return
    if (!DEVICE_TIME_ZONE || profile?.timezone === DEVICE_TIME_ZONE) return
    tzSynced.current = true
    updateProfile({ ...profile, timezone: DEVICE_TIME_ZONE }).catch(() => {})
  }, [loading, user?.id, settings?.onboardingComplete, profile?.timezone])

  // Free limits on new habits, goals and projects (see FREE_LIMITS).
  const LIMIT_OF = { habit: ['habits', habits], goal: ['goals', goals], project: ['projects', projects] }
  const atLimit = (type) => {
    if (subscription.isPro || !LIMIT_OF[type]) return false
    const [key, items] = LIMIT_OF[type]
    return activeCount(type, items) >= FREE_LIMITS[key]
  }
  const limitUpgrade = (type) => {
    const key = LIMIT_OF[type][0]
    const n = FREE_LIMITS[key]
    const active = type === 'habit' ? '' : ' active'
    triggerUpgrade(`Unlimited ${key} with Pro`, `Free includes ${n}${active} ${n === 1 ? type : key}. Pro removes the limit and unlocks the whole planner.`)
  }
  const openCreate = (type = 'task', prefill = null) => {
    if (atLimit(type)) { limitUpgrade(type); return }
    setModalState({ open: true, type, mode: 'create', item: prefill })
  }
  const openEdit = (type, item) => setModalState({ open: true, type, mode: 'edit', item })
  const closeModal = () => setModalState(modalEmpty)

  const pushToast = (title, message = '', type = 'info') => {
    const id = Date.now() + Math.random()
    setToasts((current) => [...current, { id, title, message, type }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 3200)
  }

  const dismissToast = (id) => setToasts((current) => current.filter((toast) => toast.id !== id))

  useEffect(() => {
    if (error) pushToast('Something needs attention', error, 'error')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error])


  // Reminders come from the server; just make sure this device is registered.
  useEffect(() => {
    if (!user || !hasSupabaseEnv) return
    let cancelled = false
    const t = setTimeout(async () => {
      if (!cancelled && (await PlannerPush.permission()) === 'granted') PlannerPush.subscribe()
    }, 1500)
    return () => { cancelled = true; clearTimeout(t) }
  }, [user?.id])

  // Phone app: tapping a reminder opens the page it is about.
  const navigateTo = useNavigate()
  useEffect(() => onNativeReminderTap(navigateTo), [navigateTo])

  if (loading) return <div className="auth-shell"><div className="auth-card"><p className="eyebrow">Planner Data</p><h1>Loading your workspace…</h1></div></div>


  return (
    <>
      {subscription.welcome && <WelcomeProBanner state={subscription.welcome} onDismiss={subscription.dismissWelcome} />}
      {showA2HS && !subscription.welcome && <A2HSModal onClose={dismissA2HS} />}
      {showUpgrade && <UpgradeCard title={upgradeContext.title} message={upgradeContext.message} onClose={() => setShowUpgrade(false)} />}
      <ScrollToTop />
      <Layout isPro={subscription.isPro} onUpgrade={triggerUpgrade} onQuickAdd={() => openCreate('task')} banner={<StatusBanner syncing={syncing} error={error} />} profile={profile}
        searchData={{ tasks, events, goals, projects, notes, habits }} onOpenItem={openEdit}
        onModeChange={async (id) => { await updateProfile({ ...profile, plannerMode: id }); pushToast(`${id} mode`, 'Home is arranged for this season.', 'success') }}>
        <Routes>
          <Route path="/" element={<HomePage isPro={subscription.isPro} onUpgrade={triggerUpgrade} tasks={tasks} goals={goals} projects={projects} expenses={expenses} scores={scores} budget={budget} events={events} habits={habits} habitLogs={habitLogs} settings={settings} profile={profile} onEdit={openEdit} onQuickCreate={openCreate} onToggle={async (id) => { await toggleTask(id) }} onToggleHabit={async (id) => { await toggleHabit(id) }} onSaveSteps={saveSteps} />} />
          <Route path="/tasks" element={<TasksPage tasks={tasks} settings={settings} onToggle={async (id) => { await toggleTask(id); pushToast('Task updated', 'Progress and score were refreshed.', 'success') }} onEdit={openEdit} onDelete={async (type, id) => { const t = tasks.find((x) => x.id === id); if (!window.confirm(`Delete "${t?.title || 'this task'}"?`)) return; await deleteItem(type, id); pushToast('Task deleted', 'That item is gone.', 'success') }} onQuickCreate={openCreate} />} />
          <Route path="/calendar" element={<CalendarPage tasks={tasks} events={events} settings={settings} onToast={pushToast} onSkipOccurrence={async (id, date) => { const ev = events.find((e) => e.id === id); if (!ev) return; await saveItem('event', { ...ev, skipDates: [...(ev.skipDates || []), date] }, 'edit'); pushToast('Removed that day', 'The rest of the series is unchanged.', 'success') }} onToggle={async (id) => { await toggleTask(id) }} onEdit={openEdit} onDelete={async (type, id) => { await deleteItem(type, id); pushToast('Calendar item deleted', '', 'success') }} onQuickCreate={openCreate} onReschedule={async (type, id, patch) => { const collection = type === 'event' ? events : tasks; const current = collection.find((item) => item.id === id); if (!current) return; const next = { ...current, ...patch }; if (patch.time && current.endTime) next.endTime = shiftEnd(type === 'event' ? current.startTime : current.time, patch.time, current.endTime); await saveItem(type, next, 'edit'); pushToast(type === 'task' ? 'Task rescheduled' : 'Event moved', 'The calendar updated instantly.', 'success') }} />} />
          <Route path="/projects" element={<ProjectsPage projects={projects} tasks={tasks} goals={goals} onStepsChange={(id, steps) => saveSteps('project', id, steps)} onUpdate={async (type, item, m) => { await saveItem(type, item, m); if (type === 'project' && item.status === 'Completed') pushToast('Project complete', 'Well done. Finish what you start.', 'success') }} onToggle={async (id) => { await toggleTask(id) }} onEdit={openEdit} onDelete={async (type, id) => { const pr = projects.find((x) => x.id === id); if (!window.confirm(`Delete the project "${pr?.title || ''}" and its steps?`)) return; await deleteItem(type, id); pushToast('Project removed', '', 'success') }} onQuickCreate={openCreate} />} />
          <Route path="/habits" element={<HabitsPage habits={habits} habitLogs={habitLogs} onToggleHabit={async (id, date) => { await toggleHabit(id, date) }} onEdit={openEdit} onDelete={async (type, id) => { if (window.confirm(`Delete this ${type}?`)) await deleteItem(type, id) }} onQuickCreate={openCreate} />} />
            <Route path="/goals" element={<GoalsPage goals={goals} tasks={tasks} projects={projects} onStepsChange={(id, steps) => saveSteps('goal', id, steps)} onUpdate={async (type, item, m) => { await saveItem(type, item, m); if (type === 'goal' && item.completed) pushToast('Goal achieved', 'Give thanks — then aim again.', 'success') }} onEdit={openEdit} onDelete={async (type, id) => { if (window.confirm(`Delete this ${type}?`)) await deleteItem(type, id) }} onQuickCreate={openCreate} />} />
            <Route path="/growth" element={<ProSectionGate isPro={subscription.isPro} icon={TrendingUp} title="Growth" subtitle="See who you're becoming"
              gateTitle="Growth is part of Pro" text="See what's really moving your life, week by week."
              points={['Your Life Score broken into 7 areas, and how each is calculated', 'Score trend over the last 30 days', 'Weekly pulse, intention and end-of-week review', 'Reading list and finished books']}
              onUpgrade={() => triggerUpgrade('Unlock Growth', 'Your Life Score in 7 areas, 30-day trends, weekly review and reading, plus everything else in Pro.')}><GrowthPage isPro={subscription.isPro} scores={scores} scoreDetails={scoreDetails} scoreHistory={scoreHistory} scoreSeries={scoreSeries} habits={habits} habitLogs={habitLogs} goals={goals} tasks={tasks} projects={projects} onToggleHabit={async (...args) => { await toggleHabit(...args); pushToast('Habit logged', 'Your scorecard picked that up.', 'success') }} onEdit={openEdit} onDelete={async (type, id) => { if (!window.confirm(`Delete this ${type}? Its check-in history goes with it.`)) return; await deleteItem(type, id); pushToast('Habit deleted', '', 'success') }} onQuickCreate={openCreate} budget={budget} setBudget={async (nextBudget) => { await updateBudget(nextBudget); pushToast('Budget updated', 'Finance scoring refreshed.', 'success') }} /></ProSectionGate>} />
          <Route path="/calculator" element={<CalculatorPage onQuickCreate={openCreate} />} />
          <Route path="/finance" element={<FinancePage expenses={expenses} budget={budget} setBudget={async (nextBudget) => { await updateBudget(nextBudget) }} saveItem={saveItem} deleteItem={deleteItem} goals={goals} isPro={subscription.isPro} onUpgrade={() => triggerUpgrade("Unlock the full Finance suite", "Overview and net worth, income, bills, savings, debt payoff and credit cards, giving and no-spend challenges.")} />} />
          <Route path="/wellness" element={<HealthWellnessPage isPro={subscription.isPro} onAddEvent={async (ev) => { await saveItem('event', ev, 'create') }} onUpgrade={() => triggerUpgrade("Unlock the Wellness suite", "Training, recovery, nutrition, sleep, vitals, journal, routine, meds and body metrics.")} />} />
          <Route path="/productivity" element={<ProductivityPage tasks={tasks} notes={notes} saveItem={saveItem} isPro={subscription.isPro} onUpgrade={() => triggerUpgrade("Unlock Productivity Pro", "Mind maps, checklists and the focus timer.")} onQuickCreate={openCreate} onToggle={async (id) => { await toggleTask(id) }} onEdit={openEdit} onDelete={async (type, id) => { if (window.confirm(`Delete this ${type}?`)) await deleteItem(type, id) }} settings={settings} />} />
          <Route path="/lifestyle" element={<LifestylePage isPro={subscription.isPro} onToast={pushToast} onUpgrade={() => triggerUpgrade("Unlock Full Lifestyle Suite", "Recipe cards that fill your shopping list, cleaning tracker, trips, birthdays, and gift ideas.")} />} />
          <Route path="/faith" element={<FaithPage goals={goals} tasks={tasks} projects={projects} onEdit={openEdit} onCreateGoal={async (g) => { await saveItem('goal', g, 'create') }} isPro={subscription.isPro} onUpgrade={() => triggerUpgrade("Unlock all of Faith", "Scripture and memory verses, a Bible reading plan, gratitude, fasting, sermon notes and faith goals.")} />} />
          <Route path="/health" element={<HealthWellnessPage isPro={subscription.isPro} onAddEvent={async (ev) => { await saveItem('event', ev, 'create') }} onUpgrade={() => triggerUpgrade("Unlock the Wellness suite", "Training, recovery, nutrition, sleep, vitals, journal, routine, meds and body metrics.")} />} />
          <Route path="/more" element={<MorePage profile={profile} triggerUpgrade={triggerUpgrade} settings={settings} updateProfile={updateProfile} updateSettings={updateSettings} onEdit={openEdit} onDelete={async (type, id) => { if (window.confirm(`Delete this ${type}?`)) await deleteItem(type, id) }} onQuickCreate={openCreate} />} />
        </Routes>
        <QuickAddModal
          isOpen={modalState.open}
          type={modalState.type}
          mode={modalState.mode}
          item={modalState.item}
          onClose={closeModal}
          goals={goals}
          projects={projects}
          places={recentPlaces}
          isLocked={atLimit}
          onLocked={(type) => { closeModal(); limitUpgrade(type) }}
          onSave={async (type, payload, modeArg) => {
            if (modeArg !== 'edit' && atLimit(type)) { limitUpgrade(type); return }
            if (type === 'event' && modeArg !== 'edit' && payload.deviceCalendarId) {
              // Saved straight into the person's own Apple calendar (App Store app); the planner keeps no copy
              try { await deviceCal.create(payload, payload.deviceCalendarId); pushToast('Event added', 'Saved to your Apple Calendar.', 'success') }
              catch { pushToast('Could not save to Apple Calendar', 'Nothing was added. Try again, or save it to The Living Planner.', 'error') }
              return
            }
            await saveItem(type, payload, modeArg)
            pushToast(`${labels[type] || type} ${modeArg === 'edit' ? 'updated' : 'added'}`, 'Synced across your devices.', 'success')
          }}
          onDelete={async (type, id) => {
            if (!window.confirm(`Delete this ${(labels[type] || type).toLowerCase()}? This can't be undone.`)) return false
            await deleteItem(type, id)
            pushToast(`${labels[type] || type} deleted`, '', 'success')
            return true
          }}
        />
      </Layout>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </>
  )
}


class AppErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null } }
  static getDerivedStateFromError(error) { return { hasError: true, error } }
  componentDidCatch(error, info) { console.error('APP CRASH:', error.message, info?.componentStack) }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{minHeight:'100vh', background:'#0B1829', display:'flex', alignItems:'center', justifyContent:'center', padding:24}}>
          <div style={{background:'white', borderRadius:16, padding:24, maxWidth:440, width:'100%'}}>
            <div style={{fontWeight:'bold', fontSize:16, color:'#E85555', marginBottom:12}}>App Error</div>
            <div style={{fontFamily:'monospace', fontSize:12, background:'#fff0ee', borderRadius:6, padding:12, marginBottom:12, wordBreak:'break-all'}}>
              {this.state.error?.message || 'Unknown error'}
            </div>
            <button onClick={() => this.setState({hasError:false})} style={{background:'#00C2B3', color:'#0B1829', border:'none', borderRadius:8, padding:'10px 20px', fontWeight:'bold', cursor:'pointer'}}>
              Try Again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}


function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider><AuthGate fallback={<AuthPage />}><PlannerApp /></AuthGate></AuthProvider>
    </AppErrorBoundary>
  )
}


// ── Export ────────────────────────────────────────────────────────────────
export default App

import { Routes, Route } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Layout from './components/Layout'
import QuickAddModal from './components/QuickAddModal'
import HomePage from './components/HomePage'
import TasksPage from './components/TasksPage'
import CalendarPage from './components/CalendarPage'
import ProjectsPage from './components/ProjectsPage'
import GrowthPage from './components/GrowthPage'
import MorePage from './components/MorePage'
import AuthPage from './components/AuthPage'
import AuthGate from './components/AuthGate'
import StatusBanner from './components/StatusBanner'
import ToastStack from './components/ToastStack'
import { AuthProvider } from './context/AuthContext'
import { usePlannerData } from './hooks/usePlannerData'

const modalEmpty = { open: false, type: 'task', mode: 'create', item: null }

function PlannerApp() {
  const { tasks, goals, projects, expenses, notes, events, habits, habitLogs, budget, profile, settings, scores, loading, syncing, error, saveItem, deleteItem, toggleTask, toggleHabit, updateBudget, updateProfile, updateSettings } = usePlannerData()
  const [modalState, setModalState] = useState(modalEmpty)
  const [toasts, setToasts] = useState([])

  const openCreate = (type = 'task', prefill = null) => setModalState({ open: true, type, mode: 'create', item: prefill })
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

  if (loading) return <div className="auth-shell"><div className="auth-card"><p className="eyebrow">Planner Data</p><h1>Loading your workspace…</h1></div></div>

  return (
    <>
      <Layout onQuickAdd={() => openCreate('task')} banner={<StatusBanner syncing={syncing} error={error} />} profile={profile}>
        <Routes>
          <Route path="/" element={<HomePage tasks={tasks} goals={goals} projects={projects} expenses={expenses} scores={scores} budget={budget} events={events} habits={habits} habitLogs={habitLogs} settings={settings} onEdit={openEdit} onQuickCreate={openCreate} />} />
          <Route path="/tasks" element={<TasksPage tasks={tasks} settings={settings} onToggle={async (id) => { await toggleTask(id); pushToast('Task updated', 'Progress and score were refreshed.', 'success') }} onEdit={openEdit} onDelete={async (type, id) => { await deleteItem(type, id); pushToast('Task deleted', 'That item is gone.', 'success') }} onQuickCreate={openCreate} />} />
          <Route path="/calendar" element={<CalendarPage tasks={tasks} events={events} settings={settings} onEdit={openEdit} onDelete={async (type, id) => { await deleteItem(type, id); pushToast('Calendar item deleted', '', 'success') }} onQuickCreate={openCreate} onReschedule={async (type, id, patch) => { const collection = type === 'event' ? events : tasks; const current = collection.find((item) => item.id === id); if (!current) return; await saveItem(type, { ...current, ...patch }, 'edit'); pushToast(type === 'task' ? 'Task rescheduled' : 'Event moved', 'The calendar updated instantly.', 'success') }} />} />
          <Route path="/projects" element={<ProjectsPage projects={projects} tasks={tasks} goals={goals} onEdit={openEdit} onDelete={async (type, id) => { await deleteItem(type, id); pushToast('Project removed', '', 'success') }} onQuickCreate={openCreate} />} />
          <Route path="/growth" element={<GrowthPage scores={scores} habits={habits} habitLogs={habitLogs} onToggleHabit={async (...args) => { await toggleHabit(...args); pushToast('Habit logged', 'Your scorecard picked that up.', 'success') }} onEdit={openEdit} onDelete={async (type, id) => { await deleteItem(type, id); pushToast('Habit deleted', '', 'success') }} onQuickCreate={openCreate} budget={budget} setBudget={async (nextBudget) => { await updateBudget(nextBudget); pushToast('Budget updated', 'Finance scoring refreshed.', 'success') }} />} />
          <Route path="/more" element={<MorePage goals={goals} tasks={tasks} projects={projects} expenses={expenses} notes={notes} budget={budget} profile={profile} settings={settings} updateProfile={async (nextProfile) => { await updateProfile(nextProfile); pushToast('Profile saved', '', 'success') }} updateSettings={async (nextSettings) => { await updateSettings(nextSettings); pushToast('Settings saved', '', 'success') }} onEdit={openEdit} onDelete={async (type, id) => { await deleteItem(type, id); pushToast('Item deleted', '', 'success') }} onQuickCreate={openCreate} />} />
        </Routes>
        <QuickAddModal
          isOpen={modalState.open}
          type={modalState.type}
          mode={modalState.mode}
          item={modalState.item}
          onClose={closeModal}
          goals={goals}
          projects={projects}
          onSave={async (type, payload, modeArg) => {
            await saveItem(type, payload, modeArg)
            pushToast(modeArg === 'edit' ? `${type} updated` : `${type} added`, 'Your planner synced the change.', 'success')
          }}
          onDelete={async (type, id) => {
            await deleteItem(type, id)
            pushToast(`${type} deleted`, '', 'success')
          }}
        />
      </Layout>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </>
  )
}

export default function App() {
  return <AuthProvider><AuthGate fallback={<AuthPage />}><PlannerApp /></AuthGate></AuthProvider>
}

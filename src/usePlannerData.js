import { useEffect, useMemo, useState } from 'react'
import { plannerService } from '../services/plannerService'
import { defaultData } from '../data/seed'
import { computeScores } from '../utils/scoring'
import { useAuth } from '../context/AuthContext'
import { TODAY } from '../utils/date'

const emptyCollections = {
  tasks: [],
  goals: [],
  projects: [],
  expenses: [],
  notes: [],
  events: [],
  habits: [],
  habitLogs: [],
  budget: { weeklyTarget: 350 },
  profile: defaultData.profile,
  settings: defaultData.settings,
}

export function usePlannerData() {
  const { user, isAuthenticated, mode } = useAuth()
  const [collections, setCollections] = useState(defaultData)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isAuthenticated || !user) {
      setCollections(emptyCollections)
      setLoading(false)
      return
    }

    let active = true
    setLoading(true)
    setError('')

    plannerService.loadAll(user.id)
      .then((data) => {
        if (!active) return
        setCollections(data)
      })
      .catch((err) => {
        if (!active) return
        setError(err.message || 'Failed to load planner data.')
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })

    return () => { active = false }
  }, [isAuthenticated, user?.id, mode])

  const scores = useMemo(() => computeScores(collections), [collections])

  const saveItem = async (type, payload, modeArg = 'create') => {
    if (!user) return
    setSyncing(true)
    setError('')
    try {
      const saved = await plannerService.saveItem(type, payload, modeArg, user.id)
      setCollections((current) => {
        const key = plannerService.collectionName(type)
        if (modeArg === 'edit' && payload.id) {
          return { ...current, [key]: current[key].map((item) => item.id === payload.id ? saved : item) }
        }
        return { ...current, [key]: [...current[key], saved] }
      })
      return saved
    } catch (err) {
      setError(err.message || 'Could not save the item.')
      throw err
    } finally {
      setSyncing(false)
    }
  }

  const deleteItem = async (type, id) => {
    if (!user) return
    setSyncing(true)
    setError('')
    try {
      await plannerService.deleteItem(type, id, user.id)
      setCollections((current) => {
        const key = plannerService.collectionName(type)
        const next = { ...current, [key]: current[key].filter((item) => item.id !== id) }
        if (type === 'habit') next.habitLogs = current.habitLogs.filter((log) => log.habitId !== id)
        return next
      })
    } catch (err) {
      setError(err.message || 'Could not delete the item.')
      throw err
    } finally {
      setSyncing(false)
    }
  }

  const toggleTask = async (taskId) => {
    const task = collections.tasks.find((item) => item.id === taskId)
    if (!task || !user) return
    setSyncing(true)
    setError('')
    try {
      const { updatedTask, extraTask } = await plannerService.toggleTask(task, user.id)
      setCollections((current) => ({
        ...current,
        tasks: [
          ...current.tasks.map((item) => item.id === taskId ? updatedTask : item),
          ...(extraTask ? [extraTask] : []),
        ].sort((a, b) => `${a.date}-${a.time || ''}`.localeCompare(`${b.date}-${b.time || ''}`)),
      }))
    } catch (err) {
      setError(err.message || 'Could not update task.')
      throw err
    } finally {
      setSyncing(false)
    }
  }

  const toggleHabit = async (habitId, date = TODAY) => {
    if (!user) return
    setSyncing(true)
    setError('')
    try {
      const nextLog = await plannerService.toggleHabitLog(habitId, date, user.id, collections.habitLogs)
      setCollections((current) => {
        const existing = current.habitLogs.find((log) => log.habitId === habitId && log.date === date)
        if (!existing) return { ...current, habitLogs: [...current.habitLogs, nextLog] }
        return { ...current, habitLogs: current.habitLogs.map((log) => log.id === existing.id ? nextLog : log) }
      })
    } catch (err) {
      setError(err.message || 'Could not toggle habit.')
      throw err
    } finally {
      setSyncing(false)
    }
  }

  const updateBudget = async (nextBudget) => {
    if (!user) return
    setSyncing(true)
    setError('')
    try {
      const saved = await plannerService.saveBudget(nextBudget, user.id)
      setCollections((current) => ({ ...current, budget: saved }))
    } catch (err) {
      setError(err.message || 'Could not update budget.')
      throw err
    } finally {
      setSyncing(false)
    }
  }

  const updateProfile = async (profile) => {
    if (!user) return
    setSyncing(true)
    try {
      const saved = await plannerService.saveProfile(profile, user.id)
      setCollections((current) => ({ ...current, profile: saved }))
    } finally {
      setSyncing(false)
    }
  }

  const updateSettings = async (settings) => {
    if (!user) return
    setSyncing(true)
    try {
      const saved = await plannerService.saveSettings(settings, user.id)
      setCollections((current) => ({ ...current, settings: saved }))
    } finally {
      setSyncing(false)
    }
  }

  return {
    ...collections,
    scores,
    loading,
    syncing,
    error,
    saveItem,
    deleteItem,
    toggleTask,
    toggleHabit,
    updateBudget,
    updateProfile,
    updateSettings,
  }
}

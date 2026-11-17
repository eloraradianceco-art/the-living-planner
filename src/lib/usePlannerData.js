// The hook that loads the planner's data and exposes every add / edit / delete action.
import React, { useEffect, useMemo, useState } from 'react'
import { hasSupabaseEnv, supabase } from './supabase.js'
import { TODAY, addDays } from './dates.js'
import { SCORE_VERSION, computeScoreDetails, lifeScoreOf, useScoreSources } from './score.js'
import { normalizeSteps } from './steps.js'
import { upsertById, defaultData, localKeys, tableMap, readLocal, writeLocal, mapDbRow, plannerService } from './plannerService.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { usePageDataLive } from './pageData.js'

// ── usePlannerData ────────────────────────────────────────────────────────
const emptyCollections = {
  tasks: [], goals: [], projects: [], expenses: [], notes: [],
  events: [], habits: [], habitLogs: [],
  budget: { period: 'weekly', amount: 350, weeklyTarget: 350 },
  profile: defaultData.profile,
  settings: defaultData.settings,
}

function usePlannerData() {
  const { user, isAuthenticated, mode } = useAuth()
  const [collections, setCollections] = useState(defaultData)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const pendingRef = React.useRef({})      // "table:id" → writes in flight (ignore their realtime echoes)
  const stepsQueueRef = React.useRef({})   // "table:id" → promise chain so step saves land in order
  const lastLoadRef = React.useRef(0)

  useEffect(() => {
    if (!isAuthenticated || !user) {
      setCollections(emptyCollections); setLoading(false); return
    }
    let active = true
    setLoading(true); setError('')
    plannerService.loadAll(user.id)
      .then((data) => { if (active) { setCollections(data); lastLoadRef.current = Date.now() } })
      .catch((err) => { if (active) setError(err.message || 'Failed to load data.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [isAuthenticated, user?.id, mode])

  // Live sync — changes made on another device show up here without a reload.
  useEffect(() => {
    if (!isAuthenticated || !user || !hasSupabaseEnv) return
    const LIVE = [['tasks', 'tasks'], ['goals', 'goals'], ['projects', 'projects'], ['events', 'events'],
      ['notes', 'notes'], ['expenses', 'expenses'], ['habits', 'habits']]
    let channel = supabase.channel('planner_core_' + user.id)
    LIVE.forEach(([table, key]) => {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `user_id=eq.${user.id}` }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = payload.old?.id
          if (id) setCollections((c) => ({ ...c, [key]: (c[key] || []).filter((x) => x.id !== id) }))
          return
        }
        const row = payload.new
        if (!row?.id || pendingRef.current[`${table}:${row.id}`]) return
        const mapped = mapDbRow(table, row)
        setCollections((c) => ({ ...c, [key]: upsertById(c[key] || [], mapped) }))
      })
    })
    channel.subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [isAuthenticated, user?.id])

  // Every page's lists and settings (page_data) from other devices
  usePageDataLive(user, isAuthenticated)

  // Coming back to the app (phone unlocked, tab switched) — pull a fresh copy
  // in case the live connection slept while it was in the background.
  useEffect(() => {
    if (!isAuthenticated || !user) return
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastLoadRef.current < 15000) return
      if (Object.keys(pendingRef.current).length) return
      lastLoadRef.current = Date.now()
      plannerService.loadAll(user.id).then((data) => setCollections(data)).catch(() => {})
    }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('pageshow', refresh)
    return () => { document.removeEventListener('visibilitychange', refresh); window.removeEventListener('pageshow', refresh) }
  }, [isAuthenticated, user?.id])

  const scoreSources = useScoreSources(user)
  const scoreDetails = useMemo(() => computeScoreDetails(collections, scoreSources), [collections, scoreSources])
  const scores = useMemo(() => Object.fromEntries(Object.entries(scoreDetails).map(([k, v]) => [k, v.score])), [scoreDetails])
  const [scoreHistory, setScoreHistory] = useState([])

  // Keep today's snapshot current: saved whenever the scores change (it used to be saved once, at the first
  // open of the day, so the history showed your morning score). Debounced; skipped when nothing changed.
  const lastSnapRef = React.useRef('')
  useEffect(() => {
    if (!user || !scores || loading || !hasSupabaseEnv) return
    const life = lifeScoreOf(scores)
    if (life == null) return
    // _v marks snapshots taken with the current scoring (rebuilt 2026-11-13); older ones are recalculated for the chart
    const snapshot = { user_id: user.id, date: TODAY, overall_score: Math.round(life), scores: { ...scores, _v: SCORE_VERSION } }
    const sig = JSON.stringify([TODAY, snapshot.overall_score, scores])
    if (sig === lastSnapRef.current) return
    const t = setTimeout(() => {
      supabase.from('score_history').upsert(snapshot, { onConflict: 'user_id,date' })
        .then(({ error }) => {
          if (error) return
          lastSnapRef.current = sig
          setScoreHistory((prev) => [...prev.filter((d) => d.date !== TODAY), { date: TODAY, overall_score: snapshot.overall_score, scores: snapshot.scores }].sort((a, b) => String(a.date).localeCompare(String(b.date))))
        })
    }, 1500)
    return () => clearTimeout(t)
  }, [scores, user?.id, loading])

  // Growth chart: one point per day for the last 30 days. A day saved with the current scoring uses its
  // snapshot; a day saved with the old scoring, or never saved, is recalculated from what was logged
  // up to that day; today is always live. Days with nothing tracked stay empty.
  const scoreSeries = useMemo(() => {
    if (loading) return []
    const saved = Object.fromEntries((scoreHistory || []).map((d) => [d.date, d]))
    return Array.from({ length: 30 }, (_, i) => addDays(TODAY, i - 29)).map((date) => {
      if (date === TODAY) { const l = lifeScoreOf(scores); return { date, score: l == null ? null : Math.round(l), live: true } }
      const snap = saved[date]
      if (snap && Number(snap.scores?._v) >= SCORE_VERSION) return { date, score: snap.overall_score }
      const det = computeScoreDetails(collections, scoreSources, date)
      const l = lifeScoreOf(Object.fromEntries(Object.entries(det).map(([k, v]) => [k, v.score])))
      return { date, score: l == null ? null : Math.round(l), rebuilt: true }
    })
  }, [loading, scoreHistory, scores, collections, scoreSources])

  // Load score history on mount
  useEffect(() => {
    if (!user || !hasSupabaseEnv) return
    const thirtyDaysAgo = addDays(TODAY, -30)
    supabase.from('score_history')
      .select('date, overall_score, scores')
      .eq('user_id', user.id)
      .gte('date', thirtyDaysAgo)
      .order('date', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) setScoreHistory(data)
      })
  }, [user?.id])


  const saveItem = async (type, payload, modeArg = 'create') => {
    if (!user) return
    setSyncing(true); setError('')
    try {
      // A task inside a project belongs to that project's goal.
      if (type === 'task' && payload.linkedProjectId) {
        const project = collections.projects.find((pr) => String(pr.id) === String(payload.linkedProjectId))
        if (project?.goalId) payload = { ...payload, linkedGoalId: project.goalId }
      }
      const before = type === 'project' && modeArg === 'edit' ? collections.projects.find((pr) => pr.id === payload.id) : null
      const saved = await plannerService.saveItem(type, payload, modeArg, user.id)
      setCollections((current) => {
        const key = plannerService.collectionName(type)
        if (modeArg === 'edit' && payload.id)
          return { ...current, [key]: current[key].map((item) => item.id === payload.id ? saved : item) }
        return { ...current, [key]: upsertById(current[key], saved) }
      })
      // A project moved to another goal takes its tasks with it.
      if (before && saved && String(before.goalId || '') !== String(saved.goalId || '')) {
        const moved = collections.tasks.filter((t) => t.linkedProjectId === saved.id && String(t.linkedGoalId || '') !== String(saved.goalId || ''))
        const updated = await Promise.all(moved.map((t) => plannerService.saveItem('task', { ...t, linkedGoalId: saved.goalId || '' }, 'edit', user.id)))
        if (updated.length) setCollections((current) => ({ ...current, tasks: current.tasks.map((t) => updated.find((u) => u.id === t.id) || t) }))
      }
      return saved
    } catch (err) {
      setError(err.message || 'Could not save.'); throw err
    } finally { setSyncing(false) }
  }

  const deleteItem = async (type, id) => {
    if (!user) return
    setSyncing(true); setError('')
    try {
      await plannerService.deleteItem(type, id, user.id)
      setCollections((current) => {
        const key = plannerService.collectionName(type)
        const next = { ...current, [key]: current[key].filter((item) => item.id !== id) }
        if (type === 'habit') next.habitLogs = current.habitLogs.filter((log) => log.habitId !== id)
        return next
      })
    } catch (err) {
      setError(err.message || 'Could not delete.'); throw err
    } finally { setSyncing(false) }
  }

  const toggleTask = async (taskId) => {
    const task = collections.tasks.find((item) => item.id === taskId)
    if (!task || !user) return
    setSyncing(true); setError('')
    try {
      const { updatedTask, extraTask } = await plannerService.toggleTask(task, user.id)
      setCollections((current) => ({
        ...current,
        tasks: (extraTask ? upsertById(current.tasks, extraTask) : current.tasks).map((item) => item.id === taskId ? updatedTask : item)
          .sort((a, b) => `${a.date}-${a.time || ''}`.localeCompare(`${b.date}-${b.time || ''}`)),
      }))
    } catch (err) {
      setError(err.message || 'Could not update task.'); throw err
    } finally { setSyncing(false) }
  }

  const toggleHabit = async (habitId, date = TODAY) => {
    if (!user) return
    // Optimistic update — immediately flip the UI before Supabase responds
    const existingLog = collections.habitLogs.find(l => l.habitId === habitId && l.date === date && !String(l.id).startsWith('optimistic_'))
    const wasCompleted = existingLog?.completed
    
    // Optimistically update: filter out any old/optimistic log for this habit+date, add the new state
    setCollections(prev => ({
      ...prev,
      habitLogs: [
        ...prev.habitLogs.filter(l => !(l.habitId === habitId && l.date === date)),
        { id: 'optimistic_' + habitId + '_' + date, habitId, date, completed: !wasCompleted, completedAt: new Date().toISOString() }
      ]
    }))
    
    setSyncing(true); setError('')
    try {
      const nextLog = await plannerService.toggleHabitLog(habitId, date, user.id, collections.habitLogs)
      // Replace the optimistic entry with the real one (or remove if toggle was OFF and returned nothing)
      setCollections((current) => ({
        ...current,
        habitLogs: [
          ...current.habitLogs.filter(l => !(l.habitId === habitId && l.date === date)),
          ...(nextLog && nextLog.completed ? [nextLog] : [])
        ]
      }))
    } catch (err) {
      // On error, revert optimistic update
      setCollections(prev => ({
        ...prev,
        habitLogs: prev.habitLogs.filter(l => !(l.habitId === habitId && l.date === date && String(l.id).startsWith('optimistic_')))
      }))
      setError(err.message || 'Could not toggle habit.')
    } finally { setSyncing(false) }
  }

  // Check off / add / reorder steps on a goal or project. Updates the screen
  // instantly, then saves in order; reverts if the save fails.
  const saveSteps = (type, itemId, steps) => {
    if (!user) return
    const meta = tableMap[type]
    if (!meta) return
    const key = meta.collection
    const clean = normalizeSteps(steps)
    const before = (collections[key] || []).find((x) => x.id === itemId)?.steps || []
    setCollections((c) => ({ ...c, [key]: c[key].map((x) => x.id === itemId ? { ...x, steps: clean } : x) }))
    const pk = `${meta.table}:${itemId}`
    pendingRef.current[pk] = (pendingRef.current[pk] || 0) + 1
    const write = async () => {
      if (!hasSupabaseEnv) {
        const current = readLocal(localKeys[key], defaultData[key])
        writeLocal(localKeys[key], current.map((x) => x.id === itemId ? { ...x, steps: clean } : x))
        return
      }
      const { error: err } = await supabase.from(meta.table)
        .update({ steps: clean, updated_at: new Date().toISOString() })
        .eq('id', itemId).eq('user_id', user.id)
      if (err) throw err
    }
    const run = (stepsQueueRef.current[pk] || Promise.resolve())
      .then(write)
      .catch((err) => {
        setError(err.message || 'Could not save steps.')
        setCollections((c) => ({ ...c, [key]: c[key].map((x) => x.id === itemId ? { ...x, steps: before } : x) }))
      })
      .finally(() => {
        window.setTimeout(() => {
          pendingRef.current[pk] = (pendingRef.current[pk] || 1) - 1
          if (pendingRef.current[pk] <= 0) delete pendingRef.current[pk]
        }, 1500)
      })
    stepsQueueRef.current[pk] = run
    return run
  }

  const updateBudget = async (nextBudget) => {
    if (!user) return
    setSyncing(true); setError('')
    try {
      const saved = await plannerService.saveBudget(nextBudget, user.id)
      setCollections((current) => ({ ...current, budget: saved }))
    } catch (err) {
      setError(err.message || 'Could not update budget.'); throw err
    } finally { setSyncing(false) }
  }

  const updateProfile = async (profile) => {
    if (!user) return
    setSyncing(true)
    try {
      const saved = await plannerService.saveProfile(profile, user.id)
      setCollections((current) => ({ ...current, profile: saved }))
    } finally { setSyncing(false) }
  }

  const updateSettings = async (settings) => {
    if (!user) return
    setSyncing(true)
    try {
      const saved = await plannerService.saveSettings(settings, user.id)
      setCollections((current) => ({ ...current, settings: saved }))
    } finally { setSyncing(false) }
  }

  return {
    ...collections, scores, scoreDetails, scoreHistory, scoreSeries, loading, syncing, error,
    saveItem, deleteItem, toggleTask, toggleHabit, saveSteps,
    updateBudget, updateProfile, updateSettings,
  }
}

export { usePlannerData }

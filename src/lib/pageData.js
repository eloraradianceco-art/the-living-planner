// Per-page saved data (wellness, finance, lifestyle …): load, save, and pick up changes from other devices.
import React, { useEffect, useState } from 'react'
import { hasSupabaseEnv, supabase } from './supabase.js'
import { emitPlannerData } from './score.js'
import { useAuth } from '../auth/AuthContext.jsx'

// ── WELLNESS PAGE ─────────────────────────────────────────────────────────
// ── Wellness data helpers ───────────────────────────────────────────────
// Workouts used to live under Lifestyle in device-only storage. Fold them in once.
function mergeLegacyWorkouts(current) {
  try {
    if (localStorage.getItem('planner.l.workouts.moved')) return current
    const legacy = JSON.parse(localStorage.getItem('planner.l.workouts') || '[]')
    if (!legacy.length) return current
    const ids = new Set((current || []).map((w) => String(w.id)))
    const add = legacy.filter((w) => !ids.has(String(w.id))).map((w) => ({ ...w, exercises: w.exercises || [] }))
    return add.length ? [...(current || []), ...add] : current
  } catch { return current }
}
const markLegacyWorkoutsMoved = () => { try { localStorage.setItem('planner.l.workouts.moved', '1') } catch {} }
const HW_PREFIX = 'planner.hw.'
function hwRead(key, fallback) {
  try {
    const v = localStorage.getItem(HW_PREFIX + key) ?? localStorage.getItem(key)
    return v ? JSON.parse(v) : fallback
  } catch { return fallback }
}
// Read one wellness key anywhere in the app (e.g. Home), refreshed from Supabase.
function useWellnessKey(key, fallback) {
  const { user } = useAuth()
  const [value, setValue] = useState(() => hwRead(key, fallback))
  useEffect(() => {
    if (!user || !hasSupabaseEnv) return
    let alive = true
    supabase.from('page_data').select('data_value, updated_at').eq('user_id', user.id).eq('page', 'wellness').eq('data_key', key).maybeSingle()
      .then(({ data }) => {
        if (!alive || !data) return
        // Don't let an older server copy replace a save made on this device seconds ago
        const localAt = Number(localStorage.getItem(HW_PREFIX + key + '.at') || 0)
        if (localAt && new Date(data.updated_at).getTime() < localAt - 1000) return
        setValue(data.data_value ?? fallback)
        try { localStorage.setItem(HW_PREFIX + key, JSON.stringify(data.data_value)) } catch {}
      })
    return () => { alive = false }
  }, [user?.id, key])
  // Saves from any device (this one's come back through the live channel too) keep Home's copy current
  useRemotePageData('wellness', null, (k, v) => { if (k === key) setValue(v ?? fallback) })
  return value
}

// Saves made on this device come back through live updates a moment later. Without this check that
// late copy overwrites anything typed since (letters disappearing in the devotional, 2026-11-13).
// We stamp each save's updated_at ourselves (no database trigger changes it), so a row that is not newer
// than our latest save for that key is our own echo or older, and is skipped.
const stampOf = (s) => { const t = Date.parse(String(s || '').replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00')); return Number.isFinite(t) ? t : 0 }
function useOwnWrites() {
  const last = React.useRef({})
  return React.useMemo(() => ({
    mark: (key) => { const at = new Date().toISOString(); last.current[key] = at; return at },
    isStale: (key, updatedAt) => { const mine = last.current[key]; return !!mine && stampOf(updatedAt) <= stampOf(mine) },
    // Saved on this device since the page opened: the server copy fetched on open is older, so don't apply it
    wrote: (key) => Object.prototype.hasOwnProperty.call(last.current, key),
  }), [])
}

// ── Saves from other devices (page_data) ──────────────────────────────────
// One live channel (usePageDataLive, in usePlannerData) hands every page_data row saved on another device to the
// page or widget that shows it. Pages save whole lists, so a device showing an old copy would overwrite newer work
// on its next save; applying other devices' saves as they land (and re-reading after the app was asleep, when live
// messages are missed) keeps every open copy current. Own saves coming back and older copies are skipped.
const REMOTE_PAGE_DATA = 'planner-page-data-remote'
function useRemotePageData(page, own, apply) {
  const applyRef = React.useRef(apply)
  applyRef.current = apply
  const seen = React.useRef({})
  useEffect(() => {
    const on = (e) => {
      const row = e.detail
      if (!row || row.page !== page || !row.data_key) return
      if (own && own.isStale(row.data_key, row.updated_at)) return
      const t = stampOf(row.updated_at)
      if (t && t <= (seen.current[row.data_key] || 0)) return
      seen.current[row.data_key] = t
      applyRef.current(row.data_key, row.data_value, row)
    }
    window.addEventListener(REMOTE_PAGE_DATA, on)
    return () => window.removeEventListener(REMOTE_PAGE_DATA, on)
  }, [page, own])
}
function usePageDataLive(user, enabled) {
  useEffect(() => {
    if (!enabled || !user || !hasSupabaseEnv) return
    let alive = true, hiddenAt = 0
    const hand = (row) => {
      if (!row?.data_key) return
      try { window.dispatchEvent(new CustomEvent(REMOTE_PAGE_DATA, { detail: row })) } catch {}
    }
    const channel = supabase.channel('page_data_live_' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'page_data', filter: `user_id=eq.${user.id}` }, (payload) => hand(payload.new))
      .subscribe()
    // Back from the background: re-read what changed while asleep (10-minute margin for device clocks)
    const onVis = () => {
      if (document.visibilityState === 'hidden') { hiddenAt = hiddenAt || Date.now(); return }
      if (!hiddenAt) return
      const from = new Date(hiddenAt - 10 * 60000).toISOString()
      hiddenAt = 0
      supabase.from('page_data').select('page,data_key,data_value,updated_at').eq('user_id', user.id).gt('updated_at', from)
        .then(({ data }) => { if (alive && data) data.forEach(hand) })
    }
    document.addEventListener('visibilitychange', onVis)
    return () => { alive = false; supabase.removeChannel(channel); document.removeEventListener('visibilitychange', onVis) }
  }, [enabled, user?.id])
}

// Read + write one page_data key from any component (used when a tracker moves
// between pages but keeps its stored data where it was).
function usePageKey(page, key, fallback, localKeys) {
  const { user } = useAuth()
  const keys = Array.isArray(localKeys) ? localKeys : [localKeys]
  const readLocalValue = () => {
    for (const k of keys) {
      try { const v = localStorage.getItem(k); if (v != null) { try { return { found: true, v: JSON.parse(v) } } catch { return { found: true, v } } } } catch {}
    }
    return { found: false, v: fallback }
  }
  const [value, setValue] = useState(() => readLocalValue().v)
  const own = useOwnWrites()
  useRemotePageData(page, own, (k, v) => {
    if (k !== key) return
    setValue(v ?? fallback)
    try { localStorage.setItem(keys[0], JSON.stringify(v)) } catch {}
  })
  useEffect(() => {
    if (!user || !hasSupabaseEnv) return
    let alive = true
    supabase.from('page_data').select('data_value').eq('user_id', user.id).eq('page', page).eq('data_key', key).maybeSingle()
      .then(({ data, error }) => {
        if (!alive || error) return
        if (data) { setValue(data.data_value ?? fallback); try { localStorage.setItem(keys[0], JSON.stringify(data.data_value)) } catch {} return }
        // Nothing in the account yet: move this device's copy up so other devices get it (2026-11-12)
        const local = readLocalValue()
        if (local.found && JSON.stringify(local.v) !== JSON.stringify(fallback)) {
          supabase.from('page_data').upsert({ user_id: user.id, page, data_key: key, data_value: local.v, updated_at: new Date().toISOString() }, { onConflict: 'user_id,page,data_key' })
            .then(({ error: e }) => { if (e) console.error('Sync error:', e) })
        }
      })
    return () => { alive = false }
  }, [user?.id, page, key])
  const save = React.useCallback((v) => {
    setValue(v)
    try { localStorage.setItem(keys[0], JSON.stringify(v)) } catch {}
    emitPlannerData(page, key, v)
    const at = own.mark(key)
    if (!user || !hasSupabaseEnv) return
    supabase.from('page_data').upsert({ user_id: user.id, page, data_key: key, data_value: v, updated_at: at }, { onConflict: 'user_id,page,data_key' })
      .then(({ error }) => { if (error) console.error('Sync error:', error) })
  }, [user?.id, page, key, own])
  return [value, save]
}

export {
  mergeLegacyWorkouts, markLegacyWorkoutsMoved, HW_PREFIX, hwRead, useWellnessKey, useOwnWrites,
  useRemotePageData, usePageDataLive, usePageKey,
}

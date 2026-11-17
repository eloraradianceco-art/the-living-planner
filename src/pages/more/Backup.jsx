// Settings: backup of everything saved, as one file.
import { useState } from 'react'
import { isNative, nativeShareFile } from '../../native.js'
import { Download } from 'lucide-react'
import { hasSupabaseEnv, supabase } from '../../lib/supabase.js'
import { TODAY } from '../../lib/dates.js'
import { useAuth } from '../../auth/AuthContext.jsx'

// ── Backup: everything the user has saved, as one JSON file ─────────────
const BACKUP_TABLES = ['profiles', 'planner_settings', 'budgets', 'tasks', 'events', 'goals', 'projects', 'notes', 'habits', 'habit_logs', 'expenses', 'score_history', 'page_data', 'faith_data']
async function buildBackup(user) {
  const out = { app: 'The Living Planner', version: 1, exportedAt: new Date().toISOString(), data: {} }
  if (user && hasSupabaseEnv) {
    for (const t of BACKUP_TABLES) {
      const { data, error } = await supabase.from(t).select('*').eq('user_id', user.id)
      out.data[t] = error ? { error: error.message } : data
    }
  } else {
    const local = {}
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k || !k.startsWith('planner') || k.includes('mock.user')) continue
      try { local[k] = JSON.parse(localStorage.getItem(k)) } catch { local[k] = localStorage.getItem(k) }
    }
    out.data.local = local
  }
  return out
}
async function downloadBackup(user) {
  const backup = await buildBackup(user)
  const name = `living-planner-backup-${TODAY}.json`
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  if (isNative) return nativeShareFile(JSON.stringify(backup, null, 2), name, 'Living Planner backup')
  const file = typeof File !== 'undefined' ? new File([blob], name, { type: 'application/json' }) : null
  // iPhone/iPad Home Screen apps can't download directly — hand the file to the share sheet (Save to Files)
  // (iPads report themselves as a Mac, so check for touch too)
  const iOSish = /iPad|iPhone|iPod/.test(navigator.userAgent || '') || (/Macintosh/.test(navigator.userAgent || '') && navigator.maxTouchPoints > 1)
  if (file && navigator.canShare?.({ files: [file] }) && iOSish) {
    try { await navigator.share({ files: [file], title: 'Living Planner backup' }); return 'shared' } catch (e) { if (e?.name === 'AbortError') return 'cancelled' }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  return 'downloaded'
}
function BackupButton() {
  const { user } = useAuth()
  const [state, setState] = useState('')
  return (
    <div className="backup-row">
      <div>
        <strong>Download my data</strong>
        <small>{state === 'done' ? 'Backup saved.' : state === 'working' ? 'Preparing your backup…' : state === 'error' ? 'Could not create the backup. Try again.' : 'Everything you have saved, in one file. Keep it somewhere safe.'}</small>
      </div>
      <button className="secondary-btn" disabled={state === 'working'} onClick={async () => {
        setState('working')
        try { const r = await downloadBackup(user); setState(r === 'cancelled' ? '' : 'done') } catch { setState('error') }
      }}><Download size={16} /> Backup</button>
    </div>
  )
}

export { BackupButton }

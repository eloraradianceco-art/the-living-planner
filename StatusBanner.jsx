import { useAuth } from '../context/AuthContext'

export default function StatusBanner({ syncing, error }) {
  const { mode, user, signOut } = useAuth()

  return (
    <div className="status-banner">
      <div>
        <strong>{mode === 'supabase' ? 'Supabase mode' : 'Mock mode'}</strong>
        <span>{user?.email || 'No active user'}</span>
      </div>
      <div className="status-actions">
        {syncing ? <span className="sync-pill">Syncing…</span> : <span className="sync-pill muted-pill">Idle</span>}
        {error ? <span className="error-pill">{error}</span> : null}
        <button className="ghost-btn" onClick={signOut}>Sign out</button>
      </div>
    </div>
  )
}

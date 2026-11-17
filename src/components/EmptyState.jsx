// Empty-state card.

function EmptyState({ icon, title, message, action, onAction }) {
  const Ic = typeof icon === 'string' ? null : icon
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '40px 24px', textAlign: 'center',
    }}>
      <div style={{
        width: 68, height: 68, borderRadius: '50%', marginBottom: 16,
        display: 'grid', placeItems: 'center',
        background: 'radial-gradient(circle at 30% 25%, #FBF6EC 0%, var(--brass-dim) 100%)',
        border: '1px solid var(--brass-glow)',
        boxShadow: '0 8px 22px rgba(184,150,90,.14)',
      }}>{Ic ? <Ic size={28} strokeWidth={1.5} color="var(--brass2)" /> : <span aria-hidden="true" style={{ fontSize: '2rem', lineHeight: 1 }}>{icon}</span>}</div>
      <div style={{
        fontWeight: 700, fontSize: '1rem', color: 'var(--ink)',
        marginBottom: 8,
      }}>{title}</div>
      <p style={{
        fontSize: '.85rem', color: 'var(--ink2)', lineHeight: 1.6,
        maxWidth: 260, marginBottom: action ? 20 : 0,
      }}>{message}</p>
      {action && (
        <button onClick={onAction} style={{
          padding: '10px 22px', borderRadius: 999,
          background: 'var(--ink)', color: 'var(--warm-white)',
          border: 'none', fontSize: '.88rem', fontWeight: 600,
          cursor: 'pointer', transition: 'opacity .15s',
        }}
          onMouseEnter={e => e.target.style.opacity = '.85'}
          onMouseLeave={e => e.target.style.opacity = '1'}
        >{action}</button>
      )}
    </div>
  )
}

export { EmptyState }

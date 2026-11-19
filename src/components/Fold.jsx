// A row that opens on tap (Settings 2026-11-18, Home 2026-11-19). Closed, it shows an emoji, a title and one line of detail.
// Pass `open` and `onToggle` to remember the row's state; leave them out and the row simply starts closed.
import React from 'react'

function Fold({ id, emoji, title, sub, open, onToggle, children }) {
  const controlled = typeof open === 'boolean'
  return (
    <details className="fold-row" id={id} {...(controlled ? { open } : {})}
      onToggle={(e) => { if (onToggle && e.currentTarget.open !== open) onToggle(e.currentTarget.open) }}>
      <summary>
        <span className="fold-emoji" aria-hidden="true">{emoji}</span>
        <span className="fold-text"><span className="fold-label">{title}</span>{sub && <span className="fold-sub">{sub}</span>}</span>
        <span aria-hidden="true" className="fold-caret">▾</span>
      </summary>
      <div className="fold-body">{children}</div>
    </details>
  )
}

export { Fold }

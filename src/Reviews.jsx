import { useState, useEffect } from 'react'

const REVIEWS_URL = 'https://cvtukqamaqrhjtdvmslb.supabase.co'
const REVIEWS_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2dHVrcWFtYXFyaGp0ZHZtc2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NDU1MjQsImV4cCI6MjA5MTQyMTUyNH0.gSksF5jV-UpuaUL7x7vhHHOB6Z7Qq0iehtbc2PoSAxw'

// Module-level so it doesn't remount each render. Uses <button> for reliable taps on iOS.
function StarRow({ value = 0, size = 16, interactive = false, onPick, C }) {
  const [hover, setHover] = useState(0)
  return (
    <span style={{ display: 'inline-flex', whiteSpace: 'nowrap', lineHeight: 1 }}>
      {[1, 2, 3, 4, 5].map(n => {
        const active = (interactive ? (hover || value) : value) >= n
        const glyph = active ? '\u2605' : '\u2606'
        if (!interactive) {
          return <span key={n} style={{ fontSize: size, color: active ? C.gold : C.dim, padding: '0 1px' }}>{glyph}</span>
        }
        return (
          <button key={n} type="button"
            onClick={() => onPick && onPick(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            aria-label={n + (n === 1 ? ' star' : ' stars')}
            style={{ background: 'none', border: 'none', margin: 0, padding: '4px 5px', cursor: 'pointer', fontSize: size, lineHeight: 1, color: active ? C.gold : C.dim, WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}>
            {glyph}
          </button>
        )
      })}
    </span>
  )
}

export default function Reviews({ app, appName, eyebrow, userEmail, C, lightMode, onClose }) {
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [rating, setRating] = useState(0)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [name, setName] = useState(() => (userEmail && userEmail.includes('@')) ? userEmail.split('@')[0] : '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const LS_KEY = app + '_my_review'
  const [mine, setMine] = useState(() => { try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null') } catch { return null } })

  useEffect(() => {
    let alive = true
    fetch(REVIEWS_URL + '/rest/v1/reviews?app=eq.' + app + '&status=eq.approved&select=id,rating,title,body,author_name,created_at&order=created_at.desc&limit=100', {
      headers: { apikey: REVIEWS_ANON, Authorization: 'Bearer ' + REVIEWS_ANON },
    })
      .then(r => r.ok ? r.json() : [])
      .then(d => { if (alive) { setReviews(Array.isArray(d) ? d : []); setLoading(false) } })
      .catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [app])

  const count = reviews.length
  const avg = count ? (reviews.reduce((s, r) => s + (r.rating || 0), 0) / count) : 0
  const fmtDate = (s) => { try { return new Date(s).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) } catch { return '' } }

  const submit = () => {
    setError('')
    if (rating < 1) { setError('Please tap a star rating.'); return }
    if (!body.trim()) { setError('Please write a few words about your experience.'); return }
    setSubmitting(true)
    fetch(REVIEWS_URL + '/rest/v1/reviews', {
      method: 'POST',
      headers: { apikey: REVIEWS_ANON, Authorization: 'Bearer ' + REVIEWS_ANON, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ app, rating, title: title.trim() || null, body: body.trim(), author_name: name.trim() || 'Anonymous', author_email: userEmail || null }),
    }).then(r => {
      if (r.status === 201 || r.status === 200) {
        const rec = { rating, title: title.trim(), body: body.trim(), author_name: name.trim() || 'Anonymous', created_at: new Date().toISOString() }
        try { localStorage.setItem(LS_KEY, JSON.stringify(rec)) } catch {}
        setMine(rec); setShowForm(false); setSubmitting(false)
      } else if (r.status === 409) {
        setError("You've already left a review for this app \u2014 thank you!"); setSubmitting(false)
      } else {
        return r.text().then(t => {
          setError(/duplicate|unique/i.test(t) ? "You've already reviewed this app \u2014 thank you!" : 'Something went wrong. Please try again.')
          setSubmitting(false)
        })
      }
    }).catch(() => { setError('Something went wrong. Please try again.'); setSubmitting(false) })
  }

  const card = { background: C.bgCard, border: '1px solid ' + C.border, borderRadius: 14 }
  const cin = "var(--serif)"
  const gar = "var(--sans)"
  const inputStyle = { width: '100%', padding: '12px 14px', borderRadius: 9, border: '1px solid ' + C.border, background: lightMode ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)', color: C.cream, fontFamily: gar, fontSize: 15, outline: 'none', marginBottom: 10 }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: (C.bg || (lightMode ? '#F2EDE3' : '#070E17')), fontFamily: gar, overflowY: 'auto', animation: 'fadeIn 0.25s ease' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 0 80px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid ' + C.border, position: 'sticky', top: 0, zIndex: 10, background: (C.bg || (lightMode ? '#F2EDE3' : '#070E17')), backdropFilter: 'blur(12px)' }}>
          <div>
            <div style={{ fontSize: 9, color: C.redL, letterSpacing: '0.16em', textTransform: 'uppercase', fontFamily: cin }}>{eyebrow || appName}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.cream, fontFamily: cin }}>Ratings &amp; Reviews</div>
          </div>
          <button onClick={onClose} style={{ background: C.bgCard, border: '1px solid ' + C.border, color: C.muted, width: 36, height: 36, borderRadius: 9, cursor: 'pointer', fontSize: 18 }}>&larr;</button>
        </div>

        <div style={{ padding: '20px' }}>

          {/* Aggregate */}
          <div style={{ ...card, padding: '22px', textAlign: 'center', marginBottom: 18 }}>
            {count > 0 ? (
              <>
                <div style={{ fontSize: 40, fontWeight: 700, color: C.cream, fontFamily: cin, lineHeight: 1 }}>{avg.toFixed(1)}</div>
                <div style={{ margin: '8px 0 4px' }}><StarRow value={Math.round(avg)} size={18} C={C} /></div>
                <div style={{ fontSize: 13, color: C.muted }}>{count} review{count === 1 ? '' : 's'}</div>
              </>
            ) : (
              <div style={{ fontSize: 15, color: C.muted, fontStyle: 'italic' }}>No reviews yet &mdash; be the first to share yours.</div>
            )}
          </div>

          {/* Your review / Write button / Form */}
          {mine ? (
            <div style={{ ...card, padding: '16px 18px', marginBottom: 18, borderColor: C.goldB }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: C.gold, letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: cin }}>Your Review</span>
                <span style={{ fontSize: 10, color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: cin }}>Pending approval \u23f3</span>
              </div>
              <StarRow value={mine.rating} size={15} C={C} />
              {mine.title && <div style={{ fontSize: 16, color: C.cream, fontFamily: cin, marginTop: 8 }}>{mine.title}</div>}
              <div style={{ fontSize: 15, color: C.text, marginTop: 6, lineHeight: 1.6 }}>{mine.body}</div>
            </div>
          ) : !showForm ? (
            <button onClick={() => setShowForm(true)} style={{ width: '100%', background: 'linear-gradient(135deg,' + C.red + ',' + C.redL + ')', border: 'none', color: '#fff', padding: '15px', borderRadius: 12, fontSize: 13, fontFamily: cin, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, cursor: 'pointer', marginBottom: 18 }}>
              &#9998;&nbsp; Write a Review
            </button>
          ) : (
            <div style={{ ...card, padding: '20px', marginBottom: 18 }}>
              <div style={{ fontSize: 11, color: C.muted, letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: cin, marginBottom: 8 }}>Your Rating</div>
              <div style={{ marginBottom: 18, marginLeft: -5 }}><StarRow value={rating} interactive size={32} onPick={setRating} C={C} /></div>

              <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} placeholder="Title (optional)" style={inputStyle} />
              <textarea value={body} onChange={e => setBody(e.target.value)} maxLength={2000} placeholder="What stood out to you?" rows={4} style={{ ...inputStyle, resize: 'vertical' }} />
              <input value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder="Display name" style={{ ...inputStyle, marginBottom: 4 }} />
              <div style={{ fontSize: 11, color: C.dim, marginBottom: 14 }}>Shown publicly with your review. Your email is never shown.</div>

              {error && <div style={{ fontSize: 13, color: C.redL, marginBottom: 12 }}>{error}</div>}

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => { setShowForm(false); setError('') }} style={{ flex: '0 0 auto', background: C.bgCard, border: '1px solid ' + C.border, color: C.muted, padding: '13px 20px', borderRadius: 11, fontSize: 12, fontFamily: cin, letterSpacing: '0.08em', cursor: 'pointer' }}>Cancel</button>
                <button onClick={submit} disabled={submitting} style={{ flex: 1, background: 'linear-gradient(135deg,' + C.red + ',' + C.redL + ')', border: 'none', color: '#fff', padding: '13px', borderRadius: 11, fontSize: 12, fontFamily: cin, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}>
                  {submitting ? 'Sending\u2026' : 'Submit Review'}
                </button>
              </div>
              <div style={{ fontSize: 11, color: C.dim, marginTop: 12, textAlign: 'center' }}>Reviews appear after a quick approval.</div>
            </div>
          )}

          {/* Community reviews */}
          {count > 0 && (
            <>
              <div style={{ fontSize: 9, color: C.muted, letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: cin, margin: '4px 0 10px' }}>Community</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {reviews.map(r => (
                  <div key={r.id} style={{ ...card, padding: '16px 18px' }}>
                    <StarRow value={r.rating} size={14} C={C} />
                    {r.title && <div style={{ fontSize: 16, color: C.cream, fontFamily: cin, marginTop: 8 }}>{r.title}</div>}
                    <div style={{ fontSize: 15, color: C.text, marginTop: 6, lineHeight: 1.6 }}>{r.body}</div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 10 }}>{r.author_name || 'Anonymous'} &middot; {fmtDate(r.created_at)}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {loading && <div style={{ textAlign: 'center', color: C.muted, fontSize: 14, padding: '20px' }}>Loading reviews\u2026</div>}
        </div>
      </div>
    </div>
  )
}

// Small metric tile and mini charts.
import { TODAY, formatDateLabel } from '../lib/dates.js'

function MetricTile({ label, value, helper }) {
  return (
    <div className="home-metric-tile">
      <span>{label}</span>
      <strong>{value}</strong>
      {helper ? <small>{helper}</small> : null}
    </div>
  )
}

// Home "Execution": tasks finished per day this week. Bars sized in pixels (they overflowed the card when sized
// in percent next to their labels) and the day is shown as a weekday with today marked. 2026-11-13
function MiniBarChart({ data, dataKey = 'completed', maxKey = dataKey }) {
  const max = Math.max(...data.map((item) => item[maxKey] || 0), 1)
  const BAR_MAX = 56
  return (
    <div style={{display:'flex', alignItems:'flex-end', gap:6, padding:'0 4px'}}>
      {data.map((item) => {
        const val = item[dataKey] || 0
        const total = item[maxKey] || 0
        const h = total === 0 ? 4 : Math.max(6, Math.round((val / max) * BAR_MAX))
        const isT = item.date === TODAY
        return (
          <div key={item.date || item.label} title={total ? `${val} of ${total} done` : 'Nothing due'} style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4}}>
            <div style={{fontSize:'.65rem', color:'var(--brass-fg)', fontWeight:700, minHeight:12}}>{total ? `${val}/${total}` : ''}</div>
            <div style={{height:BAR_MAX, width:'100%', display:'flex', alignItems:'flex-end'}}>
              <div style={{
                width:'100%', borderRadius:'4px 4px 0 0', height: h,
                background: val >= total && total > 0 ? 'var(--brass)' : val > 0 ? 'var(--brass-glow)' : 'var(--stone2)',
                border: '1px solid var(--brass-glow)', transition:'height .3s ease'
              }} />
            </div>
            <div style={{fontSize:'.62rem', color: isT ? 'var(--brass-fg)' : 'var(--slate)', fontWeight: isT ? 800 : 600, textAlign:'center'}}>{item.date ? formatDateLabel(item.date, { weekday: 'short' }) : item.label}</div>
          </div>
        )
      })}
    </div>
  )
}
function MiniLineChart({ data }) {
  const width = 240; const height = 80
  const values = data.map((item) => item.value)
  const max = Math.max(...values, 1); const min = Math.min(...values, 0)
  const points = data.map((item, index) => {
    const x = (index / Math.max(data.length - 1, 1)) * width
    const y = height - (((item.value - min) / Math.max(max - min, 1)) * (height - 12)) - 6
    return `${x},${y}`
  }).join(' ')
  return (
    <div className="mini-line-chart">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <polyline fill="none" stroke="currentColor" strokeWidth="3" points={points} />
      </svg>
      <div className="chart-xlabels">{data.map((item) => <span key={item.label}>{item.label}</span>)}</div>
    </div>
  )
}

export { MetricTile, MiniBarChart }

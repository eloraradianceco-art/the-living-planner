import React from 'react'

function MetricTile({ label, value, helper }) {
  return (
    <div className="home-metric-tile">
      <span>{label}</span>
      <strong>{value}</strong>
      {helper ? <small>{helper}</small> : null}
    </div>
  )
}

function MiniBarChart({ data, dataKey = 'completed', maxKey = dataKey }) {
  const max = Math.max(...data.map((item) => item[maxKey] || 0), 1)
  return (
    <div style={{display:'flex', alignItems:'flex-end', gap:6, height:64, padding:'0 4px'}}>
      {data.map((item) => {
        const val = item[dataKey] || 0
        const total = item[maxKey] || 0
        const pct = max > 0 ? Math.max((val / max) * 100, total > 0 ? 8 : 0) : 0
        return (
          <div key={item.label} style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4, height:'100%', justifyContent:'flex-end'}}>
            <div style={{fontSize:'.65rem', color:'var(--brass)', fontWeight:700}}>{val > 0 ? val : ''}</div>
            <div style={{
              width:'100%', borderRadius:'4px 4px 0 0',
              height: total === 0 ? 4 : `${pct}%`,
              background: val >= total && total > 0 ? 'var(--brass)' : val > 0 ? 'var(--brass-glow)' : 'var(--stone2)',
              border: '1px solid var(--brass-glow)',
              minHeight: 4, transition:'height .3s ease'
            }} />
            <div style={{fontSize:'.62rem', color:'var(--slate)', fontWeight:600, textAlign:'center'}}>{item.label}</div>
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

export { MetricTile, MiniBarChart, MiniLineChart }

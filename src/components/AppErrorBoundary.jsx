import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'

export class AppErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null } }
  static getDerivedStateFromError(error) { return { hasError: true, error } }
  componentDidCatch(error, info) { console.error('APP CRASH:', error.message, info?.componentStack) }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{minHeight:'100vh', background:'#0B1829', display:'flex', alignItems:'center', justifyContent:'center', padding:24}}>
          <div style={{background:'white', borderRadius:16, padding:24, maxWidth:440, width:'100%'}}>
            <div style={{fontWeight:'bold', fontSize:16, color:'#E85555', marginBottom:12}}>App Error</div>
            <div style={{fontFamily:'monospace', fontSize:12, background:'#fff0ee', borderRadius:6, padding:12, marginBottom:12, wordBreak:'break-all'}}>
              {this.state.error?.message || 'Unknown error'}
            </div>
            <button onClick={() => this.setState({hasError:false})} style={{background:'#00C2B3', color:'#0B1829', border:'none', borderRadius:8, padding:'10px 20px', fontWeight:'bold', cursor:'pointer'}}>
              Try Again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ── FAITH PAGE ───────────────────────────────────────────────────────────────
function FaithPage() {
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

// ============================================================
// MIND MAP — one idea in the center, branches out from it.
// A map is a flat list of nodes { id, parent, text, color, side, collapsed, taskId } so search can read
// it and nothing nests deep enough to cause trouble when it syncs. Layout is automatic: first-level
// branches sit right or left of the center (chosen when added, so nothing jumps around later).
// Drag to move, pinch or ctrl-scroll to zoom. Outline view shows the same map as an indented list.
// ============================================================

export const MM_COLORS = [
  ['#1F6D63', 'Teal'], ['#9E7D45', 'Brass'], ['#7E4E8C', 'Plum'], ['#4F7A3F', 'Sage'], ['#B0573A', 'Clay'], ['#3D6688', 'Blue'],
]
export const MM_TEMPLATES = [
  { id: 'blank', label: '✨ Blank', root: '', placeholder: 'Your central idea', branches: [] },
  { id: 'goal', label: '🎯 Goal plan', root: 'My goal', branches: ['Why it matters', 'What done looks like', 'Steps', 'Obstacles', 'Support & accountability'] },
  { id: 'sermon', label: '✝️ Sermon notes', root: 'Sermon', branches: ['Main passage', 'Key points', 'What it means for me', 'How I will live it', 'Prayer'] },
  { id: 'decision', label: '⚖️ Decision', root: 'Decision to make', branches: ['Options', 'Pros', 'Cons', 'Wise counsel', 'Scripture', 'Peace check'] },
  { id: 'business', label: '💼 Business idea', root: 'Business idea', branches: ['Who it serves', 'Problem it solves', 'Offer', 'Marketing', 'Money', 'Next steps'] },
  { id: 'project', label: '📁 Project', root: 'Project', branches: ['Outcome', 'Tasks', 'People', 'Resources', 'Deadlines'] },
]

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
const H_GAP = 46, V_GAP = 12, MIN_K = 0.3, MAX_K = 2.2, MIN_FIT = 0.45
// Under this canvas width (phones) every branch flows to the right of the center, so the map uses the
// tall canvas instead of a wide strip; wider screens use the classic two-sided layout.
const NARROW = 560
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

export function newMindMap(templateId, title) {
  const t = MM_TEMPLATES.find((x) => x.id === templateId) || MM_TEMPLATES[0]
  const rootText = String(title || '').trim() || t.root || 'Central idea'
  const root = { id: uid(), parent: null, text: rootText }
  const nodes = [root, ...t.branches.map((text, i) => ({ id: uid() + i, parent: root.id, text, color: MM_COLORS[i % MM_COLORS.length][0], side: i % 2 ? 'l' : 'r' }))]
  const now = Date.now()
  return { id: uid(), title: rootText, nodes, createdAt: now, updatedAt: now }
}

// ── Text measuring + wrapping (same font as the SVG text, so lines fit their boxes) ──
let measureCtx = null
function textWidth(text, font) {
  if (measureCtx === null) { try { measureCtx = document.createElement('canvas').getContext('2d') || false } catch { measureCtx = false } }
  if (!measureCtx) return String(text).length * 7.6
  measureCtx.font = font
  return measureCtx.measureText(text).width
}
function wrapText(text, font, maxW, maxLines = 4) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return ['…']
  const lines = []
  let line = ''
  for (let w of words) {
    while (textWidth(w, font) > maxW && w.length > 2) {   // a word too long for one line
      let i = w.length - 1
      while (i > 1 && textWidth(w.slice(0, i) + '-', font) > maxW) i--
      if (line) { lines.push(line); line = '' }
      lines.push(w.slice(0, i) + '-'); w = w.slice(i)
    }
    const next = line ? `${line} ${w}` : w
    if (!line || textWidth(next, font) <= maxW) line = next
    else { lines.push(line); line = w }
  }
  if (line) lines.push(line)
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  let last = kept[maxLines - 1]
  while (last.length > 1 && textWidth(`${last}…`, font) > maxW) last = last.slice(0, -1)
  kept[maxLines - 1] = `${last}…`
  return kept
}

// ── Tree helpers ──
function treeOf(map) {
  const nodes = Array.isArray(map?.nodes) ? map.nodes : []
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const kids = new Map()
  for (const n of nodes) if (n.parent != null && byId.has(n.parent)) { if (!kids.has(n.parent)) kids.set(n.parent, []); kids.get(n.parent).push(n.id) }
  const root = nodes.find((n) => n.parent == null || !byId.has(n.parent)) || null
  return { nodes, byId, kids, root }
}
function descendantsOf(kids, id) {
  const out = [], stack = [...(kids.get(id) || [])], seen = new Set()
  while (stack.length) { const k = stack.pop(); if (seen.has(k)) continue; seen.add(k); out.push(k); stack.push(...(kids.get(k) || [])) }
  return out
}

function layoutMap(map, family, oneSided = false) {
  const { byId, kids, root } = treeOf(map)
  if (!root) return null
  const info = {}, seen = new Set()
  const visit = (id, depth, color, side) => {
    if (seen.has(id)) return
    seen.add(id)
    const n = byId.get(id)
    const isRoot = depth === 0
    const size = isRoot ? 17 : depth === 1 ? 15 : 14
    const font = `${isRoot ? 700 : depth === 1 ? 600 : 500} ${size}px ${family}`
    const lh = isRoot ? 22 : depth === 1 ? 19 : 18
    const padX = isRoot ? 18 : 12, padY = isRoot ? 12 : 8
    const lines = wrapText(n.text, font, isRoot ? 190 : depth === 1 ? 170 : 160)
    const w = Math.max(isRoot ? 96 : 48, Math.ceil(Math.max(...lines.map((l) => textWidth(l, font)))) + padX * 2)
    const h = lines.length * lh + padY * 2
    const all = kids.get(id) || []
    info[id] = { id, depth, color, font, size, lines, lh, padY, w, h, side, kids: all, shown: n.collapsed && !isRoot ? [] : all, hidden: n.collapsed && !isRoot ? descendantsOf(kids, id).length : 0 }
    all.forEach((k, i) => {
      const kn = byId.get(k)
      const c = depth === 0 ? (kn.color || MM_COLORS[i % MM_COLORS.length][0]) : (kn.color || color)
      visit(k, depth + 1, c, depth === 0 ? (kn.side === 'l' ? 'l' : 'r') : side)
    })
  }
  visit(root.id, 0, null, null)
  const sub = {}
  const subH = (id) => {
    if (sub[id] != null) return sub[id]
    const i = info[id], s = i.shown.filter((k) => info[k])
    const total = s.length ? s.reduce((a, k) => a + subH(k), 0) + V_GAP * (s.length - 1) : 0
    return (sub[id] = Math.max(i.h, total))
  }
  const pos = {}, edges = []
  const placeKids = (pid, list, x, y, dir) => {
    const p = info[pid]
    const total = list.reduce((a, k) => a + subH(k), 0) + V_GAP * Math.max(0, list.length - 1)
    let top = y - total / 2
    for (const k of list) {
      const ki = info[k], hk = subH(k)
      const cx = x + dir * (p.w / 2 + H_GAP + ki.w / 2), cy = top + hk / 2
      edges.push({ id: k, color: ki.color, depth: ki.depth, x1: x + dir * p.w / 2, y1: y, x2: cx - dir * ki.w / 2, y2: cy })
      place(k, cx, cy, dir)
      top += hk + V_GAP
    }
  }
  const place = (id, x, y, dir) => { pos[id] = { x, y, dir }; const s = info[id].shown.filter((k) => info[k]); if (s.length) placeKids(id, s, x, y, dir) }
  pos[root.id] = { x: 0, y: 0, dir: 1 }
  const first = info[root.id].shown.filter((k) => info[k])
  if (oneSided) placeKids(root.id, first, 0, 0, 1)
  else {
    placeKids(root.id, first.filter((k) => info[k].side !== 'l'), 0, 0, 1)
    placeKids(root.id, first.filter((k) => info[k].side === 'l'), 0, 0, -1)
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [id, p] of Object.entries(pos)) {
    const i = info[id]
    minX = Math.min(minX, p.x - i.w / 2 - 14); maxX = Math.max(maxX, p.x + i.w / 2 + 14)
    minY = Math.min(minY, p.y - i.h / 2 - 8); maxY = Math.max(maxY, p.y + i.h / 2 + 8)
  }
  return { rootId: root.id, info, pos, edges, bounds: { minX, minY, maxX, maxY } }
}

function outlineText(map) {
  const { kids, byId, root } = treeOf(map)
  if (!root) return ''
  const out = [], seen = new Set()
  const walk = (id, depth) => {
    if (seen.has(id)) return
    seen.add(id)
    const n = byId.get(id)
    out.push(depth === 0 ? n.text : `${'  '.repeat(depth - 1)}- ${n.text}`)
    ;(kids.get(id) || []).forEach((k) => walk(k, depth + 1))
  }
  walk(root.id, 0)
  return out.join('\n')
}
async function copyText(text) {
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true } } catch {}
  try {
    const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'
    document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok
  } catch { return false }
}
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v } catch { return d } }
const lsSet = (k, v) => { try { localStorage.setItem(k, v) } catch {} }

// ── New-map form (templates) ──
function MapStarter({ onCreate, onCancel, first }) {
  const [tpl, setTpl] = useState('blank')
  const [title, setTitle] = useState('')
  const t = MM_TEMPLATES.find((x) => x.id === tpl)
  return (
    <div className="mm-starter">
      {first && <p className="muted" style={{ fontSize: '.84rem', margin: '0 0 12px', lineHeight: 1.55 }}>Put one idea in the center and branch out: a goal, a sermon, a decision, a business idea. Any branch can become a task.</p>}
      <p className="mm-label">Start from</p>
      <div className="pill-row" role="radiogroup" aria-label="Map template" style={{ gap: 6, marginBottom: 10 }}>
        {MM_TEMPLATES.map((x) => (
          <button key={x.id} type="button" role="radio" aria-checked={tpl === x.id} className={tpl === x.id ? 'pill active-pill' : 'pill'} style={{ fontSize: '.78rem' }} onClick={() => setTpl(x.id)}>{x.label}</button>
        ))}
      </div>
      {t.branches.length > 0 && <p className="muted" style={{ fontSize: '.74rem', margin: '0 0 10px' }}>Branches: {t.branches.join(' · ')}</p>}
      <label className="mm-label" htmlFor="mm-new-title">Center idea</label>
      <input id="mm-new-title" value={title} placeholder={t.placeholder || t.root} onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onCreate(newMindMap(tpl, title)) }} />
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="button" className="primary-btn" style={{ flex: 1 }} onClick={() => onCreate(newMindMap(tpl, title))}>Create map</button>
        {onCancel && <button type="button" className="ghost-btn" onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  )
}

export default function MindMapTab({ maps = [], onSave, tasks = [], onMakeTask }) {
  const navigate = useNavigate()
  const list = Array.isArray(maps) ? maps : []
  const [currentId, setCurrentId] = useState(() => lsGet('planner.p.mindMapOpen', null))
  const map = list.find((m) => m.id === currentId) || list[0] || null
  const [view, setViewRaw] = useState(() => lsGet('planner.p.mindMapView', 'map') === 'outline' ? 'outline' : 'map')
  const setView = (v) => { setViewRaw(v); lsSet('planner.p.mindMapView', v) }
  const [creating, setCreating] = useState(false)
  const [selId, setSelId] = useState(null)
  const [t, setT] = useState({ x: 0, y: 0, k: 1 })
  const tRef = useRef(t); tRef.current = t
  const [family, setFamily] = useState('system-ui, sans-serif')
  const [fontTick, setFontTick] = useState(0)
  const [copied, setCopied] = useState(false)
  const svgRef = useRef(null)
  const pendingFocus = useRef(null)
  const renameRef = useRef(null), addRef = useRef(null)
  const lastTap = useRef({ id: null, at: 0 })

  // The app's own font, and a re-measure when web fonts finish loading
  useEffect(() => {
    try { const f = getComputedStyle(document.body).fontFamily; if (f) setFamily(f) } catch {}
    const fonts = document.fonts
    const bump = () => setFontTick((n) => n + 1)
    if (fonts?.ready) fonts.ready.then(bump)
    fonts?.addEventListener?.('loadingdone', bump)
    return () => fonts?.removeEventListener?.('loadingdone', bump)
  }, [])

  const tree = useMemo(() => treeOf(map), [map])
  // Canvas width decides one- or two-sided layout
  const [narrow, setNarrow] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < NARROW + 40 : false))
  useEffect(() => {
    const svg = svgRef.current
    if (!svg || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(() => setNarrow(svg.clientWidth < NARROW))
    ro.observe(svg)
    return () => ro.disconnect()
  }, [view, map?.id, creating])
  const layout = useMemo(() => (map ? layoutMap(map, family, narrow) : null), [map, family, fontTick, narrow])
  const sel = selId && tree.byId.get(selId) ? tree.byId.get(selId) : null
  const selInfo = sel && layout ? layout.info[sel.id] : null
  const taskById = useMemo(() => new Map((tasks || []).map((x) => [String(x.id), x])), [tasks])

  // Open a map: remember it, select its center, fit it on screen
  useEffect(() => { if (map) { lsSet('planner.p.mindMapOpen', map.id); setSelId(tree.root?.id || null) } }, [map?.id])

  const fit = useCallback(() => {
    const svg = svgRef.current
    if (!svg || !layout) return
    const W = svg.clientWidth || 340, H = svg.clientHeight || 400, b = layout.bounds
    const bw = b.maxX - b.minX + 32, bh = b.maxY - b.minY + 32
    const k = clamp(Math.min(W / bw, H / bh, 1.1), MIN_FIT, MAX_K)
    // Fits: center it. Too big even zoomed out: keep the center idea on screen (left edge on a
    // one-sided map, middle otherwise) and let the rest pan into view.
    const x = bw * k <= W ? W / 2 - ((b.minX + b.maxX) / 2) * k : narrow ? 16 - b.minX * k : W / 2
    const y = bh * k <= H ? H / 2 - ((b.minY + b.maxY) / 2) * k : H / 2
    setT({ k, x, y })
  }, [layout, narrow])
  const fitOnOpen = useRef(null)
  useLayoutEffect(() => {
    const key = `${map?.id}:${view}:${narrow}`
    if (view === 'map' && layout && fitOnOpen.current !== key) { fitOnOpen.current = key; fit() }
  }, [map?.id, view, layout, fit, narrow])

  // Keep a newly added idea in view
  useLayoutEffect(() => {
    const id = pendingFocus.current
    if (!id || !layout?.pos[id] || view !== 'map') return
    pendingFocus.current = null
    const svg = svgRef.current; if (!svg) return
    const W = svg.clientWidth, H = svg.clientHeight, { x, y } = layout.pos[id], i = layout.info[id], c = tRef.current
    const left = (x - i.w / 2) * c.k + c.x, right = (x + i.w / 2) * c.k + c.x, top = (y - i.h / 2) * c.k + c.y, bottom = (y + i.h / 2) * c.k + c.y
    let dx = 0, dy = 0
    if (left < 12) dx = 12 - left; else if (right > W - 12) dx = W - 12 - right
    if (top < 12) dy = 12 - top; else if (bottom > H - 12) dy = H - 12 - bottom
    if (dx || dy) setT({ ...c, x: c.x + dx, y: c.y + dy })
  }, [layout, view])

  // ── Editing ──
  const saveMap = (next) => onSave(list.map((m) => (m.id === next.id ? { ...next, updatedAt: Date.now() } : m)))
  const patchNodes = (fn) => {
    if (!map) return
    const nodes = fn(map.nodes)
    const root = nodes.find((n) => n.parent == null)
    saveMap({ ...map, nodes, title: root ? root.text : map.title })
  }
  const setNode = (id, fields) => patchNodes((ns) => ns.map((n) => (n.id === id ? { ...n, ...fields } : n)))
  const addNode = (parentId, text) => {
    const clean = String(text || '').trim()
    if (!map || !clean || !tree.byId.get(parentId)) return null
    const parent = tree.byId.get(parentId)
    const node = { id: uid(), parent: parentId, text: clean }
    if (parent.parent == null) {
      const firsts = (tree.kids.get(parentId) || []).map((k) => tree.byId.get(k))
      const right = firsts.filter((n) => n.side !== 'l').length, left = firsts.length - right
      node.side = left < right ? 'l' : 'r'
      node.color = MM_COLORS[firsts.length % MM_COLORS.length][0]
    }
    pendingFocus.current = node.id
    patchNodes((ns) => [...ns.map((n) => (n.id === parentId && n.collapsed ? { ...n, collapsed: false } : n)), node])
    return node
  }
  const deleteNode = (id) => {
    const n = tree.byId.get(id)
    if (!n || n.parent == null) return
    const gone = new Set([id, ...descendantsOf(tree.kids, id)])
    if (gone.size > 1 && !window.confirm(`Delete "${n.text}" and the ${gone.size - 1} idea${gone.size > 2 ? 's' : ''} under it?`)) return
    patchNodes((ns) => ns.filter((x) => !gone.has(x.id)))
    setSelId(n.parent)
  }
  const createMap = (m) => { onSave([...list, m]); setCurrentId(m.id); setCreating(false) }
  const deleteMap = () => {
    if (!map || !window.confirm(`Delete the map "${map.title}"? This can't be undone.`)) return
    const rest = list.filter((m) => m.id !== map.id)
    onSave(rest); setCurrentId(rest[0]?.id || null)
  }

  // Selection panel drafts
  const [renameDraft, setRenameDraft] = useState('')
  const [addDraft, setAddDraft] = useState('')
  useEffect(() => { setRenameDraft(sel ? sel.text : '') }, [sel?.id, sel?.text])
  const commitRename = () => { const v = renameDraft.trim(); if (sel && v && v !== sel.text) setNode(sel.id, { text: v }); else if (sel) setRenameDraft(sel.text) }
  const doAdd = (asSibling = false) => {
    if (!sel) return
    const parentId = asSibling && sel.parent != null ? sel.parent : sel.id
    if (addNode(parentId, addDraft)) { setAddDraft(''); addRef.current?.focus() }
  }
  const [taskBusy, setTaskBusy] = useState(false)
  const makeTask = async () => {
    if (!sel || !onMakeTask || taskBusy) return
    setTaskBusy(true)
    try { const saved = await onMakeTask(sel.text); if (saved?.id != null) setNode(sel.id, { taskId: String(saved.id) }) } catch {} finally { setTaskBusy(false) }
  }

  const select = (id) => {
    const now = Date.now()
    if (lastTap.current.id === id && now - lastTap.current.at < 380) { renameRef.current?.focus(); renameRef.current?.select?.() }
    lastTap.current = { id, at: now }
    setSelId(id)
  }

  // ── Pan / pinch / wheel ──
  const pointers = useRef(new Map()), gesture = useRef(null), moved = useRef(false)
  const local = (cx, cy) => { const r = svgRef.current.getBoundingClientRect(); return [cx - r.left, cy - r.top] }
  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 1) { moved.current = false; gesture.current = { type: 'pan', sx: e.clientX, sy: e.clientY, t0: { ...tRef.current } } }
    else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      gesture.current = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, m0: local((a.x + b.x) / 2, (a.y + b.y) / 2), t0: { ...tRef.current } }
      moved.current = true
    }
  }
  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    if (!g) return
    if (g.type === 'pan') {
      const dx = e.clientX - g.sx, dy = e.clientY - g.sy
      if (!moved.current) { if (Math.hypot(dx, dy) < 6) return; moved.current = true; try { svgRef.current.setPointerCapture(e.pointerId) } catch {} }
      setT({ ...g.t0, x: g.t0.x + dx, y: g.t0.y + dy })
    } else if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const k = clamp(g.t0.k * (Math.hypot(a.x - b.x, a.y - b.y) / g.d0), MIN_K, MAX_K)
      const [mx, my] = local((a.x + b.x) / 2, (a.y + b.y) / 2)
      const wx = (g.m0[0] - g.t0.x) / g.t0.k, wy = (g.m0[1] - g.t0.y) / g.t0.k
      setT({ k, x: mx - wx * k, y: my - wy * k })
    }
  }
  const onPointerUp = (e) => {
    const wasDown = pointers.current.delete(e.pointerId)
    if (pointers.current.size === 1) {
      const [p] = [...pointers.current.values()]
      gesture.current = { type: 'pan', sx: p.x, sy: p.y, t0: { ...tRef.current } }
    } else if (pointers.current.size === 0) {
      gesture.current = null
      if (wasDown && !moved.current && e.type === 'pointerup' && !e.target.closest?.('[data-node]')) setSelId(null)
    }
  }
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return undefined
    const onWheel = (e) => {
      e.preventDefault()
      const c = tRef.current, [mx, my] = local(e.clientX, e.clientY)
      if (e.ctrlKey || e.metaKey) {
        const k = clamp(c.k * Math.exp(-e.deltaY * 0.01), MIN_K, MAX_K)
        const wx = (mx - c.x) / c.k, wy = (my - c.y) / c.k
        setT({ k, x: mx - wx * k, y: my - wy * k })
      } else setT({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [view, map?.id, creating])
  const zoomBy = (f) => {
    const svg = svgRef.current; if (!svg) return
    const c = tRef.current, mx = svg.clientWidth / 2, my = svg.clientHeight / 2
    const k = clamp(c.k * f, MIN_K, MAX_K), wx = (mx - c.x) / c.k, wy = (my - c.y) / c.k
    setT({ k, x: mx - wx * k, y: my - wy * k })
  }

  // ── Render ──
  if (!map || creating) {
    return (
      <section className="card mm-card">
        <p className="eyebrow">Mind Map</p>
        <h3 style={{ margin: '4px 0 10px' }}>{list.length ? 'New Mind Map' : 'Start a Mind Map'}</h3>
        <MapStarter first={!list.length} onCreate={createMap} onCancel={list.length ? () => setCreating(false) : null} />
      </section>
    )
  }

  const taskOf = (n) => (n?.taskId ? taskById.get(String(n.taskId)) : null)
  const selTask = taskOf(sel)
  const selKids = sel ? (tree.kids.get(sel.id) || []) : []
  const isRoot = sel && sel.parent == null

  const nodeLabel = (n, i) => {
    const task = taskOf(n)
    return `${n.text}${i?.hidden ? `, ${i.hidden} folded` : ''}${task ? (task.completed ? ', task done' : ', in Tasks') : ''}`
  }

  return (
    <section className="card mm-card">
      <div className="mm-head">
        <div style={{ minWidth: 0, flex: 1 }}>
          <p className="eyebrow">Mind Map</p>
          {list.length > 1 ? (
            <select className="mm-select" aria-label="Choose a map" value={map.id} onChange={(e) => setCurrentId(e.target.value)}>
              {list.map((m) => <option key={m.id} value={m.id}>{m.title || 'Untitled map'}</option>)}
            </select>
          ) : <h3 className="mm-title">{map.title}</h3>}
        </div>
        <button type="button" className="ghost-btn mm-new" onClick={() => setCreating(true)}>+ New map</button>
      </div>

      <div className="mm-toolbar">
        <div className="pill-row" role="radiogroup" aria-label="View" style={{ gap: 6 }}>
          {[['map', 'Map'], ['outline', 'Outline']].map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={view === v} className={view === v ? 'pill active-pill' : 'pill'} style={{ fontSize: '.78rem' }} onClick={() => setView(v)}>{l}</button>
          ))}
        </div>
        <button type="button" className="ghost-btn mm-small" onClick={async () => { if (await copyText(outlineText(map))) { setCopied(true); setTimeout(() => setCopied(false), 1600) } }}>{copied ? 'Copied ✓' : 'Copy as text'}</button>
      </div>

      {view === 'map' ? (
        <div className="mm-canvas">
          <svg ref={svgRef} className="mm-svg" role="group" aria-label={`Mind map: ${map.title}`}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
            <g transform={`translate(${t.x} ${t.y}) scale(${t.k})`}>
              {layout.edges.map((e) => {
                const mx = (e.x1 + e.x2) / 2
                return <path key={`e-${e.id}`} d={`M${e.x1} ${e.y1}C${mx} ${e.y1} ${mx} ${e.y2} ${e.x2} ${e.y2}`} fill="none" stroke={e.color} strokeOpacity={e.depth === 1 ? 0.9 : 0.65} strokeWidth={e.depth === 1 ? 3 : e.depth === 2 ? 2 : 1.5} strokeLinecap="round" />
              })}
              {Object.entries(layout.pos).map(([id, p]) => {
                const i = layout.info[id], n = tree.byId.get(id), on = selId === id, root = i.depth === 0
                const task = taskOf(n)
                const fill = root ? '#1C1C1E' : i.depth === 1 ? `${i.color}24` : '#FFFFFF'
                const stroke = root ? '#1C1C1E' : i.color
                const baseY = i.padY + (i.lh - i.size) / 2 + i.size * 0.8
                return (
                  <g key={id} data-node={id} className={`mm-node${on ? ' on' : ''}`} role="button" tabIndex={0} aria-pressed={on} aria-label={nodeLabel(n, i)}
                    transform={`translate(${p.x - i.w / 2} ${p.y - i.h / 2})`}
                    onClick={() => { if (!moved.current) select(id) }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (selId === id) { renameRef.current?.focus() } else setSelId(id) }
                      else if ((e.key === 'Delete' || e.key === 'Backspace') && !root) { e.preventDefault(); deleteNode(id) }
                    }}>
                    {on && <rect x={-4} y={-4} width={i.w + 8} height={i.h + 8} rx={root ? Math.min((i.h + 8) / 2, 26) : 13} fill="none" stroke="#B8965A" strokeWidth={2.5} />}
                    <rect width={i.w} height={i.h} rx={root ? Math.min(i.h / 2, 22) : 10} fill={fill} stroke={stroke} strokeWidth={root ? 0 : i.depth === 1 ? 1.8 : 1.3} />
                    <text className="mm-text" x={i.w / 2} y={baseY} textAnchor="middle" fill={root ? '#FDFCFA' : '#1C1C1E'} style={{ font: i.font }} aria-hidden="true">
                      {i.lines.map((l, k) => <tspan key={k} x={i.w / 2} dy={k ? i.lh : 0}>{l}</tspan>)}
                    </text>
                    {task && (
                      <g transform={`translate(${i.w - 6} ${-6})`} aria-hidden="true">
                        <circle r={8} fill={task.completed ? '#266E39' : '#FFFFFF'} stroke={task.completed ? '#266E39' : '#1F6D63'} strokeWidth={1.6} />
                        <path d="M-3.5 0.2l2.3 2.3 4.6-4.8" fill="none" stroke={task.completed ? '#FFFFFF' : '#1F6D63'} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
                      </g>
                    )}
                    {i.hidden > 0 && (
                      <g className="mm-fold" transform={`translate(${p.dir < 0 ? -12 : i.w + 12} ${i.h / 2})`} aria-hidden="true"
                        onClick={(e) => { e.stopPropagation(); if (!moved.current) setNode(id, { collapsed: false }) }}>
                        <circle r={11} fill={i.color} />
                        <text y={4} textAnchor="middle" fill="#FFFFFF" style={{ font: `700 11px ${family}` }}>+{i.hidden}</text>
                      </g>
                    )}
                  </g>
                )
              })}
            </g>
          </svg>
          <div className="mm-zoom" role="group" aria-label="Zoom">
            <button type="button" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.25)}>−</button>
            <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1.25)}>+</button>
            <button type="button" aria-label="Fit the whole map" onClick={fit}>Fit</button>
          </div>
        </div>
      ) : (
        <ul className="mm-outline" role="tree" aria-label={`Outline: ${map.title}`}>
          {(() => {
            const seen = new Set()
            const row = (id, depth) => {
              if (seen.has(id)) return null
              seen.add(id)
              const n = tree.byId.get(id), ks = tree.kids.get(id) || [], i = layout?.info[id]
              const task = taskOf(n), open = !n.collapsed || depth === 0
              return (
                <li key={id} role="treeitem" aria-expanded={ks.length ? open : undefined} aria-selected={selId === id}>
                  <div className={`mm-row${selId === id ? ' on' : ''}`} style={{ paddingLeft: 6 + depth * 18 }}>
                    {ks.length > 0 && depth > 0
                      ? <button type="button" className="mm-twist" aria-label={open ? `Fold ${n.text}` : `Unfold ${n.text}`} onClick={() => setNode(id, { collapsed: open })}>{open ? '▾' : '▸'}</button>
                      : <span className="mm-twist" aria-hidden="true" />}
                    <button type="button" className="mm-row-btn" onClick={() => setSelId(id)}>
                      <span className="mm-dot" style={{ background: depth === 0 ? '#1C1C1E' : i?.color || MM_COLORS[0][0] }} aria-hidden="true" />
                      <span style={{ fontWeight: depth === 0 ? 700 : depth === 1 ? 600 : 400 }}>{n.text}</span>
                      {task && <span className="mm-task-tag">{task.completed ? '✓ done' : '✓ task'}</span>}
                      {!open && <span className="muted" style={{ fontSize: '.72rem' }}> +{descendantsOf(tree.kids, id).length}</span>}
                    </button>
                  </div>
                  {open && ks.length > 0 && <ul role="group">{ks.map((k) => row(k, depth + 1))}</ul>}
                </li>
              )
            }
            return tree.root ? row(tree.root.id, 0) : null
          })()}
        </ul>
      )}

      {sel ? (
        <div className="mm-panel" aria-label="Selected idea">
          <label className="mm-label" htmlFor="mm-rename">{isRoot ? 'Center idea' : 'Idea'}</label>
          <input id="mm-rename" ref={renameRef} value={renameDraft} onChange={(e) => setRenameDraft(e.target.value)} onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitRename(); e.currentTarget.blur() } if (e.key === 'Escape') { setRenameDraft(sel.text); e.currentTarget.blur() } }} />
          <label className="mm-label" htmlFor="mm-add" style={{ marginTop: 10 }}>Add a branch to “{sel.text.length > 28 ? `${sel.text.slice(0, 28)}…` : sel.text}”</label>
          <div className="mm-add">
            <input id="mm-add" ref={addRef} value={addDraft} placeholder="Type an idea, press Enter" onChange={(e) => setAddDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); doAdd(false) } }} />
            <button type="button" className="primary-btn" disabled={!addDraft.trim()} onClick={() => doAdd(false)}>Add</button>
          </div>
          {!isRoot && <button type="button" className="ghost-btn mm-small" style={{ marginTop: 6 }} disabled={!addDraft.trim()} onClick={() => doAdd(true)}>Add beside it instead</button>}
          {!isRoot && (
            <div className="mm-colors" role="radiogroup" aria-label="Branch color">
              {MM_COLORS.map(([c, name]) => (
                <button key={c} type="button" role="radio" aria-checked={(selInfo?.color || '') === c} aria-label={name} title={name}
                  className={`mm-swatch${(selInfo?.color || '') === c ? ' on' : ''}`} style={{ background: c }} onClick={() => setNode(sel.id, { color: c })} />
              ))}
            </div>
          )}
          <div className="mm-actions">
            {!isRoot && selKids.length > 0 && (
              <button type="button" className="ghost-btn mm-small" onClick={() => setNode(sel.id, { collapsed: !sel.collapsed })}>{sel.collapsed ? `Unfold (${descendantsOf(tree.kids, sel.id).length})` : 'Fold'}</button>
            )}
            {selTask
              ? <button type="button" className="ghost-btn mm-small" onClick={() => navigate('/tasks')}>{selTask.completed ? '✓ Task done · View' : '✓ In Tasks · View'}</button>
              : onMakeTask && <button type="button" className="ghost-btn mm-small" disabled={taskBusy} onClick={makeTask}>{taskBusy ? 'Adding…' : '→ Make it a task'}</button>}
            {!isRoot
              ? <button type="button" className="ghost-btn mm-small" style={{ color: 'var(--danger)' }} onClick={() => deleteNode(sel.id)}>Delete</button>
              : <button type="button" className="ghost-btn mm-small" style={{ color: 'var(--danger)' }} onClick={deleteMap}>Delete map</button>}
          </div>
        </div>
      ) : (
        <p className="muted mm-hint">Tap an idea to rename it or add branches. Drag to move around; pinch or use + / − to zoom.</p>
      )}
    </section>
  )
}

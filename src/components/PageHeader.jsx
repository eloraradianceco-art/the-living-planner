// Page header, icons, the quick-access grid and tab navigation.
import {
  LayoutDashboard, Banknote, CreditCard, PiggyBank, TrendingDown, HeartHandshake, ClipboardList,
  CircleSlash, Smile, Moon, PenLine, Sunrise, BookOpen, Pill, Activity, Wind, CloudLightning,
  Shield, SquareCheck, Brain, StickyNote, ListChecks, Timer, Sparkles, Lightbulb, ShoppingCart,
  ChefHat, Plane, Cake, Gift, Dumbbell, HandHeart, ScrollText, BookMarked, Flower2, Hourglass, Mic,
  Target, Lock, BatteryCharging, Utensils, Stethoscope, Network,
} from 'lucide-react'

// ── Quick Access Grid — shown at top of each page ─────────────────────────
// ── Icon system — one consistent line-icon set instead of platform emoji ─
const SECTION_ICONS = {
  // Finance
  overview: LayoutDashboard, income: Banknote, expenses: CreditCard, savings: PiggyBank, debt: TrendingDown,
  donations: HeartHandshake, budget: ClipboardList, nospend: CircleSlash,
  // Wellness
  mood: Smile, sleep: Moon, journal: PenLine, routine: Sunrise, reading: BookOpen, meds: Pill,
  metrics: Activity, anxiety: Wind, migraines: CloudLightning, coping: Shield, training: Dumbbell, recovery: BatteryCharging, nutrition: Utensils, care: Stethoscope,
  // Productivity
  tasks: SquareCheck, braindump: Brain, notes: StickyNote, mindmap: Network, checklists: ListChecks, focus: Timer, cleaning: Sparkles, tips: Lightbulb,
  // Lifestyle
  groceries: ShoppingCart, recipes: ChefHat, trips: Plane, birthdays: Cake, gifts: Gift,
  // Faith
  devotional: BookOpen, prayer: HandHeart, scripture: ScrollText, gratitude: Flower2, fasting: Hourglass, sermons: Mic, goals: Target,
}
const FAITH_ICON_OVERRIDES = { reading: BookMarked }
// Labels in the TABS arrays still start with an emoji — strip it for display
const stripEmoji = (label = '') => String(label).replace(/^[^\p{L}\p{N}]+\s*/u, '')
// Leading emoji of a label, forced to color presentation ("✈" → "✈️") — 2026-11-12: emoji back on tiles
const emojiOf = (label = '') => {
  const m = String(label).match(/^([^\p{L}\p{N}\s]+)\s/u)
  if (!m) return ''
  return [...m[1]].length === 1 ? m[1] + '\uFE0F' : m[1] // single symbol: ask for the color version
}
const withEmoji = (label = '') => { const e = emojiOf(label); return e ? `${e} ${stripEmoji(label)}` : label }

// Brand mark — brass circle, diamond and cross (matches the printable planner)
function BrandMark({ size = 56, color = 'var(--brass)', ink = 'var(--ink)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" style={{ display: 'block', margin: '0 auto' }}>
      <circle cx="32" cy="32" r="29" fill="none" stroke={color} strokeWidth="1.6" />
      <circle cx="32" cy="32" r="24.5" fill="none" stroke={color} strokeWidth=".6" opacity=".55" />
      <path d="M32 15 L49 32 L32 49 L15 32 Z" fill={color} />
      <path d="M32 23.5 V40.5 M26 31 H38" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

// Page header — a real title instead of a tiny emoji eyebrow
function PageHeader({ icon: Icon, eyebrow, title, subtitle, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '4px 2px 6px' }}>
      <div style={{
        width: 46, height: 46, borderRadius: 14, flexShrink: 0,
        background: 'linear-gradient(145deg, var(--ink) 0%, #2C2C2E 100%)',
        display: 'grid', placeItems: 'center',
        boxShadow: '0 6px 18px rgba(28,28,30,.18), inset 0 0 0 1px rgba(184,150,90,.28)',
      }}>
        {Icon && <Icon size={22} strokeWidth={1.6} color="var(--brass)" />}
      </div>
      <div style={{ minWidth: 0 }}>
        {eyebrow && <p style={{ fontSize: '.6rem', fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color:'var(--brass-fg)', margin: '0 0 2px' }}>{eyebrow}</p>}
        <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 500, fontSize: '1.85rem', lineHeight: 1.05, letterSpacing: '-.015em', color: 'var(--ink)', margin: 0 }}>{title}</h1>
        {subtitle && <p style={{ fontSize: '.8rem', color: 'var(--muted)', margin: '3px 0 0', lineHeight: 1.35 }}>{subtitle}</p>}
      </div>
      {action && <div style={{ marginLeft: 'auto', flexShrink: 0 }}>{action}</div>}
    </div>
  )
}

function QuickAccessGrid({ tabs, activeTab, onSelect, proTabs = [], isPro = false, iconOverrides = {} }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))',
      gap: 8,
      marginBottom: 16,
    }}>
      {tabs.map(t => {
        const active = activeTab === t.id
        const isLocked = !isPro && proTabs.includes(t.id)
        const name = stripEmoji(t.label)
        const emoji = emojiOf(t.label)
        const Icon = iconOverrides[t.id] || SECTION_ICONS[t.id]
        return (
          <button key={t.id} onClick={() => onSelect(t.id)} aria-pressed={active} style={{
            position: 'relative',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 6,
            padding: '12px 4px 10px',
            borderRadius: 14,
            border: active ? '1px solid var(--ink)' : '1px solid var(--border)',
            background: active ? 'linear-gradient(160deg, var(--ink) 0%, #2C2C2E 100%)' : 'var(--warm-white)',
            boxShadow: active ? '0 8px 20px rgba(28,28,30,.22), inset 0 0 0 1px rgba(184,150,90,.25)' : '0 1px 2px rgba(28,28,30,.04)',
            cursor: 'pointer',
            transition: 'all .18s ease',
            minHeight: 70,
            opacity: isLocked ? .62 : 1,
          }}>
            {emoji
              ? <span aria-hidden="true" style={{ fontSize: '1.45rem', lineHeight: 1, filter: active ? 'drop-shadow(0 2px 6px rgba(0,0,0,.35))' : 'none' }}>{emoji}</span>
              : Icon ? <Icon size={21} strokeWidth={1.6} color={active ? 'var(--brass)' : 'var(--ink2)'} />
              : <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>{t.label[0]}</span>}
            <span style={{
              fontSize: '.66rem', fontWeight: 600,
              color: active ? 'var(--warm-white)' : 'var(--ink2)',
              textAlign: 'center', lineHeight: 1.2,
              letterSpacing: '.02em',
            }}>{name}</span>
            {isLocked && (
              <span style={{ position: 'absolute', top: 6, right: 6, display: 'grid', placeItems: 'center' }}>
                <Lock size={11} strokeWidth={2} color="var(--brass2)" />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── Tab Navigator — prev/next pills ──────────────────────────────────────
function TabNav({ tabs, activeTab, onSelect }) {
  const idx = tabs.findIndex(t => t.id === activeTab)
  const prev = idx > 0 ? tabs[idx - 1] : null
  const next = idx < tabs.length - 1 ? tabs[idx + 1] : null
  if (!prev && !next) return null
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      marginTop: 24, paddingTop: 16, paddingBottom: 80,
      borderTop: '1px solid var(--border)',
      gap: 8,
    }}>
      {prev ? (
        <button onClick={() => onSelect(prev.id)} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '9px 16px', borderRadius: 999,
          border: '1.5px solid var(--border2)', background: 'var(--stone)',
          color: 'var(--ink2)', fontSize: '.82rem', fontWeight: 600,
          cursor: 'pointer', transition: 'all .15s',
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brass)'; e.currentTarget.style.color = 'var(--brass2)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--ink2)' }}
        >
          ← {withEmoji(prev.label)}
        </button>
      ) : <div />}
      {next ? (
        <button onClick={() => onSelect(next.id)} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '9px 16px', borderRadius: 999,
          border: '1px solid var(--ink)', background: 'var(--ink)',
          color: 'var(--warm-white)', fontSize: '.82rem', fontWeight: 600,
          cursor: 'pointer', transition: 'all .15s',
        }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '.85' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
        >
          {withEmoji(next.label)} →
        </button>
      ) : <div />}
    </div>
  )
}

export {
  FAITH_ICON_OVERRIDES, stripEmoji, emojiOf, withEmoji, BrandMark, PageHeader, QuickAccessGrid,
  TabNav,
}

// Navigation: the tab bar, menu groups, planner modes and the ?tab= helper.
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  SquareCheck, Target, Wallet, Leaf, Repeat, TrendingUp, Cross, Zap, Compass, CalendarDays, Folder,
  House, Calculator,
} from 'lucide-react'
import { FREE_MODES } from '../lib/subscription.js'

// Phone bottom bar. The last slot opens the Menu sheet with every section.
// The fourth slot is Habits (2026-11-18): a daily check-off everyone can open. It was Growth, which is a
// Pro page, so free accounts had a locked tab. Growth is in the Menu and behind Home's Life Score.
const tabs = [
  { to: '/', label: 'Home', icon: House, emoji: '🏠' },
  { to: '/tasks', label: 'Tasks', icon: SquareCheck, emoji: '✅' },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays, emoji: '📅' },
  { to: '/habits', label: 'Habits', icon: Repeat, emoji: '🔁' },
]

// Additional routes not in bottom nav
const subRoutes = ['/growth', '/goals', '/finance', '/wellness', '/productivity', '/lifestyle', '/health', '/projects', '/faith']

// Every section of the planner — drives the iPad/desktop side nav and Home's Quick Access.
const NAV_GROUPS = [
  { label: 'Plan', items: [
    { to: '/',          label: 'Home',      icon: House, emoji: '🏠' },
    { to: '/tasks',     label: 'Tasks',     icon: SquareCheck, emoji: '✅' },
    { to: '/calendar',  label: 'Calendar',  icon: CalendarDays, emoji: '📅' },
    { to: '/projects',  label: 'Projects',  icon: Folder, emoji: '📁' },
  ]},
  { label: 'Grow', items: [
    { to: '/habits',    label: 'Habits',    icon: Repeat, emoji: '🔁' },
    { to: '/goals',     label: 'Goals',     icon: Target, emoji: '🎯' },
    { to: '/growth',    label: 'Growth',    icon: TrendingUp, emoji: '📈' },
  ]},
  { label: 'Life', items: [
    { to: '/finance',      label: 'Finance',           icon: Wallet, emoji: '💰' },
    { to: '/calculator',   label: 'Calculator',        icon: Calculator, emoji: '🧮' },
    { to: '/wellness',     label: 'Health & Wellness', icon: Leaf, emoji: '❤️', also: ['/health'] },
    { to: '/productivity', label: 'Productivity',      icon: Zap, emoji: '⚡' },
    { to: '/lifestyle',    label: 'Lifestyle',         icon: Compass, emoji: '🏡' },
    { to: '/faith',        label: 'Faith',             icon: Cross, emoji: '🙏' },
  ]},
]
const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items)

// Planner modes reorder Home around a season's priority. Nothing is hidden,
// and the Life Score is calculated the same way in every mode.
const PLANNER_MODES = [
  { id: 'Balanced',  icon: Compass,    emoji: '⚖️',    line: 'Everything in its place: today, faith, goals and your score in balance.' },
  { id: 'Execution', icon: Zap,        emoji: '🚀',        line: 'Leads with your schedule, anything overdue, and the next step on every project.' },
  { id: 'Wellness',  icon: Leaf,       emoji: '🌿',       line: "Leads with today's habits and your body: training, sleep, recovery." },
  { id: 'Growth',    icon: TrendingUp, emoji: '📈', line: 'Leads with your goals, their next steps, and your weekly review.' },
]
const modeOf = (profile) => PLANNER_MODES.find((m) => m.id === profile?.plannerMode) || PLANNER_MODES[0]
// Free accounts use Balanced; the other modes are Pro (a saved Pro mode comes back when Pro does).
const effectiveMode = (profile, isPro) => { const m = modeOf(profile); return isPro || FREE_MODES.includes(m.id) ? m : PLANNER_MODES[0] }

// Everything before 'more' shows when Home opens: today first (focus, the clock, the Word, anything overdue),
// then the numbers and Quick Access. Everything after it sits under "More on Home", closed until tapped
// (2026-11-18: Home was over four screens long and today's schedule started on the second one).
const HOME_ORDER = {
  Balanced:  ['hero', 'focus', 'schedule', 'faith', 'overdue', 'metrics', 'quick', 'score', 'more', 'goals', 'suggestions', 'woty', 'execution', 'tomorrow'],
  Execution: ['hero', 'overdue', 'schedule', 'focus', 'nextSteps', 'faith', 'metrics', 'quick', 'more', 'execution', 'tomorrow', 'suggestions', 'goals', 'score', 'woty'],
  Wellness:  ['hero', 'body', 'faith', 'focus', 'schedule', 'metrics', 'quick', 'more', 'score', 'suggestions', 'goals', 'overdue', 'execution', 'tomorrow', 'woty'],
  Growth:    ['hero', 'woty', 'goals', 'nextSteps', 'review', 'faith', 'focus', 'quick', 'more', 'score', 'metrics', 'schedule', 'overdue', 'suggestions', 'execution', 'tomorrow'],
}
const isNavActive = (item, path) => item.to === '/'
  ? path === '/'
  : path === item.to || path.startsWith(item.to + '/') || (item.also || []).includes(path)

// Lets any link open a page on a specific tab: /faith?tab=sermons
function useUrlTab(initial) {
  const location = useLocation()
  const urlTab = new URLSearchParams(location.search).get('tab')
  const [tab, setTab] = useState(urlTab || initial)
  useEffect(() => { if (urlTab) setTab(urlTab) }, [urlTab, location.key])
  return [tab, setTab]
}

export {
  tabs, NAV_GROUPS, NAV_ITEMS, PLANNER_MODES, modeOf, effectiveMode, HOME_ORDER, isNavActive,
  useUrlTab,
}

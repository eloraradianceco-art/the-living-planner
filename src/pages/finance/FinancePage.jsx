// Finance page: overview, income, expenses, savings, debt, giving, budget, no-spend.
import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Wallet, Calculator } from 'lucide-react'
import { hasSupabaseEnv, supabase } from '../../lib/supabase.js'
import { TODAY, startOfWeek, endOfWeek } from '../../lib/dates.js'
import {
  expenseWeeklyShare, weekSpendOf, BUDGET_PERIODS, normBudget, convertBudget, budgetSpend,
  emitPlannerData,
} from '../../lib/score.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { useUrlTab } from '../../shell/nav.js'
import { PRO_TABS, ProTabGate } from '../../components/Pro.jsx'
import { EmptyState } from '../../components/EmptyState.jsx'
import { PageHeader, SectionPicker, TabNav } from '../../components/PageHeader.jsx'
import { money2, parseMoney, SavingsItem } from './Savings.jsx'
import { DEBT_TYPES, debtTypeOf, utilTone, ExpenseRow } from './Expenses.jsx'
import { useOwnWrites, useRemotePageData } from '../../lib/pageData.js'
import { Fold } from '../../components/Fold.jsx'

function FinancePage({ expenses, budget, setBudget, saveItem, deleteItem, goals, isPro = false, onUpgrade = () => {} }) {
  const { user } = useAuth()

  // Generic Supabase sync for FinancePage state
  const ownFin = useOwnWrites()
  const syncPageData = React.useCallback(async (key, value) => {
    try { localStorage.setItem('planner.f.' + key, JSON.stringify(value)) } catch {}
    emitPlannerData('finance', key, value)
    const at = ownFin.mark(key)
    if (!user || !hasSupabaseEnv) return
    try {
      await supabase.from('page_data').upsert({
        user_id: user.id, page: 'finance', data_key: key, data_value: value,
        updated_at: at
      }, { onConflict: 'user_id,page,data_key' })
    } catch (e) { console.error('Finance sync error:', e) }
  }, [user?.id, ownFin])

  // One place that knows which state each finance key fills (load on open + other devices' saves)
  const applyFinance = (key, v) => {
    const set = {
      incomes: () => setIncomes(v || []), bills: () => setBills(v || []), debts: () => setDebts(v || []),
      savingsGoals: () => setSavingsGoals(v || []), donations: () => setDonations(v || []),
      netWorthHistory: () => setNetWorthHistory(v || []), sinkingFunds: () => setSinkingFunds(v || []),
      noSpend: () => setNoSpend(v || { days: 30, checked: [] }), weekPlan: () => setCheckedWeeks(v || []),
      challengeGoal: () => setChallengeGoal(v || 10000),
    }[key]
    if (!set) return false
    set()
    return true
  }

  // Load finance data from Supabase on mount
  React.useEffect(() => {
    if (!user || !hasSupabaseEnv) return
    supabase.from('page_data')
      .select('data_key, data_value')
      .eq('user_id', user.id).eq('page', 'finance')
      .then(({ data, error }) => {
        if (error || !data) return
        data.forEach(row => {
          if (ownFin.wrote(row.data_key)) return
          applyFinance(row.data_key, row.data_value)
        })
      })
  }, [user?.id])
  // Saves from another device (all finance lists, not just four of them)
  useRemotePageData('finance', ownFin, (key, value) => {
    if (!applyFinance(key, value)) return
    try { localStorage.setItem('planner.f.' + key, JSON.stringify(value)) } catch {}
    emitPlannerData('finance', key, value)
  })

  const lsGet = (k, d) => { try { const v = localStorage.getItem('planner.f.' + k); return v ? JSON.parse(v) : d } catch { return d } }
  const lsSet = (k, v) => { try { localStorage.setItem('planner.f.' + k, JSON.stringify(v)) } catch {} }

  const [tab, setTab] = useUrlTab(isPro ? 'overview' : 'budget')
  // Budget: daily, weekly or monthly. The amount saves when you finish typing (not on every keystroke).
  const bud = normBudget(budget)
  const budInfo = BUDGET_PERIODS[bud.period]
  const [targetDraft, setTargetDraft] = useState(String(bud.amount))
  React.useEffect(() => { setTargetDraft(String(bud.amount)) }, [bud.amount, bud.period])
  const saveBudgetSafe = (next) => Promise.resolve(setBudget(next)).catch(() => {})
  const budSpend = budgetSpend(expenses, bud.period)
  const [budListAll, setBudListAll] = useState(false)
  // Expense being edited (by id) and how many recent expenses the Expenses list shows
  const [editingExp, setEditingExp] = useState(null)
  const [expLimit, setExpLimit] = useState(20)
  const saveExpenseEdit = async (next) => { await saveItem('expense', next, 'edit'); setEditingExp(null) }
  const deleteExpense = async (exp) => { await deleteItem('expense', exp.id); setEditingExp(null) }
  const expenseRowProps = (exp) => ({
    exp, editing: editingExp != null && editingExp === exp.id,
    onEdit: () => setEditingExp(exp.id), onCancel: () => setEditingExp(null),
    onSave: saveExpenseEdit, onDelete: () => deleteExpense(exp),
  })
  const [period, setPeriod] = useState('monthly')

  // ── Shared state (linked across tabs) ─────────────────────────────────
  const [incomes, setIncomes] = useState(() => lsGet('incomes', []))
  const saveIncomes = (v) => { setIncomes(v); syncPageData('incomes', v) }

  // ── Income is logged per month: each month starts fresh ───────────────
  const CUR_MONTH = TODAY.slice(0, 7)
  const ymOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  // Older entries have no month saved — place them in the month they were added (id is a timestamp)
  const incomeMonthOf = (inc) => inc.month || (inc.date ? String(inc.date).slice(0, 7)
    : (inc.id && !isNaN(Number(inc.id)) ? ymOf(new Date(Number(inc.id))) : CUR_MONTH))
  const monthLabel = (mk, opts = { month: 'long', year: 'numeric' }) => new Date(`${mk}-01T12:00:00`).toLocaleDateString('en-US', opts)
  const shiftMonth = (mk, n) => { const d = new Date(`${mk}-01T12:00:00`); d.setMonth(d.getMonth() + n); return ymOf(d) }
  // Entries made under the old "income source" form were recurring (weekly/quarterly/etc.) — count their monthly equivalent
  const INCOME_MULT = { weekly: 1, biweekly: 2, monthly: 4.33, quarterly: 13, yearly: 52 }
  const incomeInMonth = (inc) => inc.period && INCOME_MULT[inc.period] && inc.period !== 'monthly'
    ? Number(inc.amount || 0) / INCOME_MULT[inc.period] * 4.33
    : Number(inc.amount || 0)
  const incomesForMonth = (mk) => incomes.filter(inc => incomeMonthOf(inc) === mk)
  const incomeTotalForMonth = (mk) => incomesForMonth(mk).reduce((s, inc) => s + incomeInMonth(inc), 0)
  const [incomeView, setIncomeView] = useState(CUR_MONTH)
  const defaultIncomeDate = (mk) => mk === CUR_MONTH ? TODAY : `${mk}-01`
  const [newIncome, setNewIncome] = useState({ label: '', amount: '', category: 'Primary', date: TODAY })
  React.useEffect(() => { setNewIncome(p => ({ ...p, date: defaultIncomeDate(incomeView) })) }, [incomeView])

  const [bills, setBills] = useState(() => lsGet('bills', []))
  const [newBill, setNewBill] = useState({ label: '', amount: '', category: 'Need', frequency: 'monthly' })
  const saveBills = (v) => { setBills(v); syncPageData('bills', v) }

  const [debts, setDebts] = useState(() => lsGet('debts', []))
  const BLANK_DEBT = { type: 'card', name: '', balance: '', limit: '', rate: '', minPayment: '' }
  const [newDebt, setNewDebt] = useState(BLANK_DEBT)
  const [editingDebt, setEditingDebt] = useState(null)
  const saveDebts = (d) => { setDebts(d); syncPageData('debts', d) }

  const [savingsGoals, setSavingsGoals] = useState(() => lsGet('savingsGoals', [
    { id: 1, label: 'Emergency Fund', goal: 1000, current: 0, color: 'var(--teal)' },
  ]))
  const [newSavings, setNewSavings] = useState({ label: '', goal: '', current: '', targetDate: '' })
  const saveSavingsGoals = (v) => { setSavingsGoals(v); syncPageData('savingsGoals', v) }

  const [noSpend, setNoSpend] = useState(() => lsGet('noSpend', { days: 30, checked: [] }))
  const saveNoSpend = (n) => { setNoSpend(n); syncPageData('noSpend', n) }


  // 52-week plan
  const WEEK_PLAN = [150,200,150,250,200,150,200,250,150,200,150,250,200,150,200,250,150,200,150,200,250,150,200,150,200,250,150,200,150,250,200,150,200,250,150,200,150,250,200,150,200,250,150,200,150,200,250,150,200,150,200,250]
  // Week 1 = Jan 1–7 (date math on the plain date; the old version mixed UTC and local and showed week 0 on Jan 1)
  const currentWeekNum = Math.min(52, Math.floor((Date.parse(TODAY + 'T12:00:00Z') - Date.parse(TODAY.slice(0, 4) + '-01-01T12:00:00Z')) / 86400000 / 7) + 1)
  const [checkedWeeks, setCheckedWeeks] = useState(() => lsGet('weekPlan', []))
  const [challengeGoal, setChallengeGoal] = useState(() => lsGet('challengeGoal', 10000))
  const [netWorthHistory, setNetWorthHistory] = useState(() => lsGet('netWorthHistory', []))
  const saveNetWorth = (h) => { setNetWorthHistory(h); syncPageData('netWorthHistory', h) }
  const [newNetWorth, setNewNetWorth] = useState({assets:'', liabilities:'', date:TODAY})
  const [sinkingFunds, setSinkingFunds] = useState(() => lsGet('sinkingFunds', []))
  const saveSinkingFunds = (f) => { setSinkingFunds(f); syncPageData('sinkingFunds', f) }
  const [newSinking, setNewSinking] = useState({name:'', target:'', current:'', dueDate:''})
  const [donations, setDonations] = useState(() => lsGet('donations', []))
  const saveDonations = (d) => { setDonations(d); syncPageData('donations', d) }
  const [newDonation, setNewDonation] = useState({ recipient: '', amount: '', category: 'Tithe', date: TODAY, taxDeductible: true })
  const [addingExpense, setAddingExpense] = useState(false)
  const [showNetWorthForm, setShowNetWorthForm] = useState(false)
  const [showSinkingForm, setShowSinkingForm] = useState(false)
  const [newExpense, setNewExpense] = useState({desc:'',amount:'',category:'Food',period:'one-time',date:TODAY})
  const saveCheckedWeeks = (v) => { setCheckedWeeks(v); syncPageData('weekPlan', v) }
  const saveChallengeGoal = (v) => { setChallengeGoal(v); syncPageData('challengeGoal', v) }
  const toggleWeek = (w) => saveCheckedWeeks(checkedWeeks.includes(w) ? checkedWeeks.filter(x => x !== w) : [...checkedWeeks, w])
  const totalSavedSoFar = checkedWeeks.reduce((s, w) => s + (WEEK_PLAN[w - 1] || 0), 0)

  // ── Shared computations (linked across all tabs) ───────────────────────
  const PERIOD_MULT = { weekly: 1, monthly: 4.33, quarterly: 13, yearly: 52 }
  // Everything else on the Finance page (overview, budget plan, cash flow, savings ETA) uses this month's logged income
  const totalWeeklyIncome = incomeTotalForMonth(CUR_MONTH) / 4.33
  const incomeLabel = period === 'monthly' ? `Income (${monthLabel(CUR_MONTH, { month: 'long' })})` : `Income (${period}, from ${monthLabel(CUR_MONTH, { month: 'short' })})`
  const getIncomeForPeriod = (p) => totalWeeklyIncome * (PERIOD_MULT[p] || 4.33)
  const totalIncomeForPeriod = getIncomeForPeriod(period)

  const fpWeekStart = startOfWeek(TODAY)
  const fpWeekEnd = endOfWeek(TODAY)
  // Helper: convert any expense to weekly equivalent based on its period
  const toWeekly = (e) => {
    const amt = parseFloat(e.amount || 0)
    const p = e.period || 'one-time'
    if (p === 'weekly') return amt
    if (p === 'biweekly') return amt / 2
    if (p === 'monthly') return amt / 4.33
    if (p === 'yearly') return amt / 52
    return amt  // one-time
  }
  // One-time expenses: only count if in date range
  // Recurring expenses: always count as weekly equivalent
  const fpOneTimeWeek = (expenses || [])
    .filter(e => (e.period || 'one-time') === 'one-time' && e.date >= fpWeekStart && e.date <= fpWeekEnd)
    .reduce((s, e) => s + parseFloat(e.amount || 0), 0)
  const fpRecurringWeek = (expenses || [])
    .filter(e => (e.period || 'one-time') !== 'one-time')
    .reduce((s, e) => s + toWeekly(e), 0)
  const fpWeekSpend = weekSpendOf(expenses, fpWeekStart, fpWeekEnd)

  const fpOneTimeMonth = (expenses || [])
    .filter(e => (e.period || 'one-time') === 'one-time' && e.date && e.date.slice(0,7) === TODAY.slice(0,7))
    .reduce((s, e) => s + parseFloat(e.amount || 0), 0)
  const fpRecurringMonth = fpRecurringWeek * 4.33
  const fpMonthSpend = fpOneTimeMonth + fpRecurringMonth

  // Convert each bill to monthly equivalent based on its frequency
  const billToMonthly = (b) => {
    const amt = Number(b.amount || 0)
    const freq = b.frequency || 'monthly'
    if (freq === 'weekly') return amt * 4.33
    if (freq === 'biweekly') return amt * 2.17
    if (freq === 'monthly') return amt
    if (freq === 'quarterly') return amt / 3
    if (freq === 'yearly') return amt / 12
    return amt
  }
  const totalBillsMonthly = bills.reduce((s, b) => s + billToMonthly(b), 0)
  const totalBillsForPeriod = totalBillsMonthly * ((PERIOD_MULT[period] || 4.33) / 4.33)
  const totalDebtPayments = debts.reduce((s, d) => s + Number(d.minPayment || 0), 0)
  // Credit cards: available credit = limit − balance; utilization = balance ÷ limit (cards with a limit only)
  const debtTotals = debts.reduce((t, d) => {
    const bal = Math.max(0, Number(d.balance) || 0), lim = Number(d.limit) || 0
    t.balance += bal
    if (debtTypeOf(d) === 'card' && lim > 0) { t.limit += lim; t.cardBalance += bal; t.available += Math.max(0, lim - bal) }
    return t
  }, { balance: 0, limit: 0, cardBalance: 0, available: 0 })
  const totalSavingsStored = savingsGoals.reduce((s, g) => s + Number(g.current || 0), 0)

  // 50/30/20
  // Spending for the selected period: this week, this month, or this month's pace × 3 / × 12
  const periodSpend = period === 'weekly' ? fpWeekSpend : period === 'monthly' ? fpMonthSpend : fpMonthSpend * ((PERIOD_MULT[period] || 4.33) / 4.33)
  const periodDebt = totalDebtPayments * ((PERIOD_MULT[period] || 4.33) / 4.33)
  const needs50 = totalIncomeForPeriod * 0.5
  const wants30 = totalIncomeForPeriod * 0.3
  const savings20 = totalIncomeForPeriod * 0.2

  const noSpendFilled = noSpend.checked.length
  const daysArray = Array.from({ length: noSpend.days }, (_, i) => i + 1)

  const fmt = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const TABS = [
    { id: 'overview', label: '📊 Overview' },
    { id: 'income', label: '💵 Income' },
    { id: 'expenses', label: '💳 Expenses & Bills' },
    { id: 'savings', label: '💰 Savings' },
    { id: 'debt', label: '📉 Debt' },
    { id: 'donations', label: '✝️ Giving' },
    { id: 'budget', label: '📋 Budget Plan' },
    { id: 'nospend', label: '🌿 No-Spend' },
  ]

  const PeriodPills = () => (
    <div className="pill-row" style={{marginBottom:14,gap:6}}>
      {['weekly','monthly','quarterly','yearly'].map(p => (
        <button key={p} className={period===p?'pill active-pill':'pill'}
          onClick={()=>setPeriod(p)} style={{fontSize:'.78rem',textTransform:'capitalize'}}>{p}</button>
      ))}
    </div>
  )

  return (
    <div className="screen-stack">
      <PageHeader icon={Wallet} title="Finance" subtitle="Steward what you've been given"
        action={<Link to="/calculator" className="ghost-btn calc-link" aria-label="Open the calculator"><Calculator size={15} /> <span>Calculator</span></Link>} />
      <SectionPicker tabs={TABS} activeTab={tab} onSelect={setTab} proTabs={PRO_TABS.finance} isPro={isPro} />

      {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <section className="card">
          {/* Net Worth Tracker */}
          {(() => {
            const latest = netWorthHistory[netWorthHistory.length-1]
            const prev = netWorthHistory[netWorthHistory.length-2]
            const netWorth = latest ? (Number(latest.assets) - Number(latest.liabilities)) : 0
            const change = (latest && prev) ? netWorth - (Number(prev.assets) - Number(prev.liabilities)) : 0
            return (
              <div style={{
                background: 'linear-gradient(135deg, var(--ink) 0%, var(--navy, #0B1829) 100%)',
                borderRadius: 14, padding: '18px 20px', marginBottom: 16, color: 'white',
              }}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                  <div>
                    <p style={{fontSize:'.62rem',fontWeight:700,letterSpacing:'.1em',color:'var(--brass-fg)',textTransform:'uppercase',margin:'0 0 4px'}}>Net Worth</p>
                    <strong style={{fontSize:'1.6rem',display:'block'}}>{fmt(netWorth)}</strong>
                    {change !== 0 && (
                      <span style={{fontSize:'.78rem',color: change > 0 ? '#22C55E' : '#EF4444',fontWeight:600}}>
                        {change > 0 ? '↑' : '↓'} {fmt(Math.abs(change))} from last entry
                      </span>
                    )}
                  </div>
                  <button onClick={() => setShowNetWorthForm(!showNetWorthForm)} style={{
                    padding:'6px 14px',borderRadius:999,background:'rgba(184,150,90,.18)',
                    color:'var(--brass-fg)',border:'1px solid rgba(184,150,90,.35)',
                    fontSize:'.78rem',fontWeight:600,cursor:'pointer',
                  }}>{showNetWorthForm ? 'Cancel' : '+ Update'}</button>
                </div>
                {showNetWorthForm && (
                  <div style={{marginTop:14,padding:14,background:'rgba(255,255,255,.05)',borderRadius:10,display:'grid',gap:8}}>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                      <input type="number" placeholder="Total assets ($)" value={newNetWorth.assets}
                        onChange={e => setNewNetWorth(p => ({...p, assets: e.target.value}))}
                        style={{padding:'9px 12px',border:'1px solid rgba(255,255,255,.2)',borderRadius:8,fontSize:'.88rem',background:'rgba(255,255,255,.1)',color:'white'}} />
                      <input type="number" placeholder="Total liabilities ($)" value={newNetWorth.liabilities}
                        onChange={e => setNewNetWorth(p => ({...p, liabilities: e.target.value}))}
                        style={{padding:'9px 12px',border:'1px solid rgba(255,255,255,.2)',borderRadius:8,fontSize:'.88rem',background:'rgba(255,255,255,.1)',color:'white'}} />
                    </div>
                    <button onClick={() => {
                      if(!newNetWorth.assets) return
                      saveNetWorth([...netWorthHistory, {...newNetWorth, id: Date.now(), assets: Number(newNetWorth.assets), liabilities: Number(newNetWorth.liabilities||0)}])
                      setNewNetWorth({assets:'', liabilities:'', date:TODAY})
                      setShowNetWorthForm(false)
                    }} style={{padding:'10px',background:'var(--brass-text)',color:'white',border:'none',borderRadius:8,fontWeight:600,cursor:'pointer'}}>Save Snapshot</button>
                  </div>
                )}
                {netWorthHistory.length > 1 && (
                  <div style={{marginTop:12,display:'flex',alignItems:'flex-end',gap:2,height:40}}>
                    {netWorthHistory.slice(-12).map((nw, i, arr) => {
                      // Scaled between the lowest and highest snapshot so negative net worth still draws
                      const vals = arr.map(x => Number(x.assets || 0) - Number(x.liabilities || 0))
                      const val = vals[i], lo = Math.min(0, ...vals), hi = Math.max(...vals)
                      const h = 6 + ((val - lo) / ((hi - lo) || 1)) * 94
                      return <div key={i} style={{flex:1,height:h+'%',background:'var(--brass)',borderRadius:'2px 2px 0 0',opacity:.6}} />
                    })}
                  </div>
                )}
              </div>
            )
          })()}

          <p className="eyebrow">Financial Overview</p>
          <h3 style={{ margin: '4px 0 14px' }}>Your Money at a Glance</h3>
          <PeriodPills />
          {[
            [incomeLabel, fmt(totalIncomeForPeriod), 'var(--success)'],
            ['Total Bills', fmt(totalBillsForPeriod), 'var(--danger)'],
            ['Expenses (tracked)', fmt(periodSpend), 'var(--warning,#f90)'],
            ['Debt Min Payments', fmt(periodDebt), 'var(--danger)'],
            ['Net Available', fmt(totalIncomeForPeriod - totalBillsForPeriod - periodDebt - periodSpend), totalIncomeForPeriod - totalBillsForPeriod - periodDebt - periodSpend >= 0 ? 'var(--success)' : 'var(--danger)'],
            ['This Week Spend', fmt(fpWeekSpend), 'var(--brass-fg)'],
            ['This Month Spend', fmt(fpMonthSpend), 'var(--slate)'],
            bud.amount > 0 ? [`Budget Left (${budInfo.span})`, fmt(bud.amount - budSpend.total), bud.amount - budSpend.total >= 0 ? 'var(--success)' : 'var(--danger)'] : null,
            debtTotals.balance > 0 ? ['Total Debt Balance', fmt(debtTotals.balance), 'var(--danger)'] : null,
            debtTotals.limit > 0 ? ['Credit Available', fmt(debtTotals.available), 'var(--success)'] : null,
            ['Total Saved (goals)', fmt(totalSavingsStored), 'var(--teal)'],
          ].filter(Boolean).map(([label, val, col]) => (
            <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 0',borderBottom:'1px solid var(--border)'}}>
              <span style={{fontSize:'.88rem',color:'var(--ink2)'}}>{label}</span>
              <strong style={{color:col}}>{val}</strong>
            </div>
          ))}

          {/* 50/30/20 */}
          <div style={{marginTop:18,background:'var(--stone)',borderRadius:12,padding:'16px'}}>
            <p className="eyebrow" style={{marginBottom:6}}>50 / 30 / 20 Rule</p>
            <p className="muted" style={{fontSize:'.78rem',marginBottom:12}}>Based on {period === 'monthly' ? `${monthLabel(CUR_MONTH, { month: 'long' })}'s` : `your ${period}`} income of {fmt(totalIncomeForPeriod)}</p>
            {[
              // Actuals: bills + debt minimums count as needs; tracked spending as wants; what's left as savings
              ['50% Needs', needs50, totalBillsForPeriod + periodDebt, '#256A2A', 'Rent, utilities, groceries, insurance, min debt payments', 'used'],
              ['30% Wants', wants30, periodSpend, '#8F5300', 'Dining, shopping, subscriptions, gym, travel', 'used'],
              ['20% Savings & Debt', savings20, Math.max(0, totalIncomeForPeriod - totalBillsForPeriod - periodDebt - periodSpend), '#9C27B0', 'Emergency fund, investments, extra debt payments', 'left over'],
            ].map(([label, amt, actual, col, desc, verb]) => {
              const over = verb === 'used' && amt > 0 && actual > amt
              return (
              <div key={label} style={{marginBottom:12}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                  <strong style={{fontSize:'.85rem'}}>{label}</strong>
                  <strong style={{color:col,fontSize:'.85rem'}}>{fmt(amt)}</strong>
                </div>
                <div style={{height:8,borderRadius:999,background:'var(--border)',marginBottom:4,overflow:'hidden'}}>
                  <div style={{height:'100%',borderRadius:999,background: over ? 'var(--danger)' : col,width:`${amt > 0 ? Math.min(100, Math.round(actual / amt * 100)) : 0}%`}} />
                </div>
                <p className="muted" style={{fontSize:'.72rem',margin:0}}>{amt > 0 ? <><strong style={{color: over ? 'var(--danger)' : 'var(--ink2)'}}>{fmt(actual)} {verb}</strong> · </> : null}{desc}</p>
              </div>
              )
            })}
          </div>

          {/* 4 Tips */}
          <div style={{marginTop:18}}>
            <p className="eyebrow" style={{marginBottom:12}}>4 Tips to Improve Your Finances</p>
            {[
              ['Know Your Numbers Exactly','Income, expenses, debt, savings. You cannot improve what you refuse to measure.','#e8d5f5'],
              ['Spend Intentionally, Not Emotionally','Every purchase is a choice. Pause before non-essential spending.','#fde8e8'],
              ['Automate Every Good Financial Habit','Savings, bills, investments. Remove the decision entirely.','#d5eaf5'],
              ['Focus on Progress, Not Perfection','Small consistent improvements compound into massive change over time.','#d5f5e3'],
            ].map(([title, desc, bg]) => (
              <div key={title} style={{background:bg,borderRadius:10,padding:'12px 14px',marginBottom:8}}>
                <strong style={{fontSize:'.82rem',display:'block',marginBottom:4}}>{title}</strong>
                <p className="muted" style={{fontSize:'.78rem',margin:0,lineHeight:1.5}}>{desc}</p>
              </div>
            ))}
          </div>
        </section>
        </ProTabGate>
      )}

      {/* ── INCOME ───────────────────────────────────────────────────────── */}
      {tab === 'donations' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <section className="card">
          <p className="eyebrow">Giving</p>
          <h3 style={{ margin: '4px 0 8px' }}>Tithes & Offerings</h3>
          <p className="muted" style={{fontSize:'.8rem',marginBottom:14}}>
            "Bring the whole tithe into the storehouse" — Malachi 3:10
          </p>

          {/* Summary stats */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:14}}>
            {(() => {
              const thisYear = new Date().getFullYear()
              const ytd = donations.filter(d => d.date && d.date.startsWith(thisYear+'')).reduce((s,d)=>s+Number(d.amount||0),0)
              const thisMonth = donations.filter(d => d.date && d.date.slice(0,7) === TODAY.slice(0,7)).reduce((s,d)=>s+Number(d.amount||0),0)
              const taxDed = donations.filter(d => d.date && d.date.startsWith(thisYear+'') && d.taxDeductible).reduce((s,d)=>s+Number(d.amount||0),0)
              return [
                ['This Month', fmt(thisMonth), 'var(--teal)'],
                ['Year to Date', fmt(ytd), 'var(--brass-fg)'],
                ['Tax-Deductible', fmt(taxDed), 'var(--success)'],
              ].map(([label,val,color]) => (
                <div key={label} style={{background:'var(--stone)',borderRadius:10,padding:'10px 8px',textAlign:'center'}}>
                  <div className="muted" style={{fontSize:'.65rem',fontWeight:600,letterSpacing:'.05em',textTransform:'uppercase',marginBottom:2}}>{label}</div>
                  <strong style={{color,fontSize:'.92rem'}}>{val}</strong>
                </div>
              ))
            })()}
          </div>

          {/* Quick Add Pills */}
          <p style={{fontSize:'.72rem',color:'var(--ink2)',fontWeight:600,letterSpacing:'.06em',textTransform:'uppercase',marginBottom:8}}>Quick Categories</p>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4, 1fr)',gap:6,marginBottom:14}}>
            {[
              {icon:'✝️', label:'Tithe', cat:'Tithe'},
              {icon:'🎁', label:'Offering', cat:'Offering'},
              {icon:'🤲', label:'Missions', cat:'Missions'},
              {icon:'💝', label:'Charity', cat:'Charity'},
            ].map(({icon, label, cat}) => (
              <button key={cat} onClick={() => setNewDonation(p => ({...p, category: cat}))} style={{
                display:'flex', flexDirection:'column', alignItems:'center', gap:3,
                padding:'8px 4px', borderRadius:10, cursor:'pointer',
                background: newDonation.category === cat ? 'var(--brass-dim)' : 'var(--stone)',
                border: newDonation.category === cat ? '1.5px solid var(--brass)' : '1.5px solid var(--border2)',
              }}>
                <div style={{fontSize:'1.2rem'}}>{icon}</div>
                <div style={{fontSize:'.7rem',color:'var(--ink2)',fontWeight:600}}>{label}</div>
              </button>
            ))}
          </div>

          {/* Add form */}
          <div style={{background:'var(--stone)',borderRadius:12,padding:14,marginBottom:14,display:'grid',gap:8}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <input placeholder="Recipient (church, charity)" value={newDonation.recipient}
                onChange={e => setNewDonation(p => ({...p, recipient: e.target.value}))}
                style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:8,fontSize:'.88rem'}} />
              <input type="number" placeholder="Amount" value={newDonation.amount}
                onChange={e => setNewDonation(p => ({...p, amount: e.target.value}))}
                style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:8,fontSize:'.88rem'}} />
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <input type="date" value={newDonation.date}
                onChange={e => setNewDonation(p => ({...p, date: e.target.value}))}
                style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:8,fontSize:'.88rem'}} />
              <label style={{display:'flex',alignItems:'center',gap:6,fontSize:'.82rem',cursor:'pointer'}}>
                <input type="checkbox" checked={newDonation.taxDeductible}
                  onChange={e => setNewDonation(p => ({...p, taxDeductible: e.target.checked}))} />
                Tax-deductible
              </label>
            </div>
            <button onClick={() => {
              if(!newDonation.recipient || !newDonation.amount) return
              saveDonations([...donations, {...newDonation, id: Date.now(), amount: Number(newDonation.amount)}])
              setNewDonation({recipient:'', amount:'', category:'Tithe', date:TODAY, taxDeductible:true})
            }} style={{padding:'10px',background:'var(--brass-text)',color:'white',border:'none',borderRadius:8,fontWeight:600,cursor:'pointer'}}>
              + Log Donation
            </button>
          </div>

          {/* List */}
          {donations.length === 0 ? (
            <EmptyState icon="✝️" title="Track your giving" message="Log tithes, offerings, and charitable donations. Total at tax time." />
          ) : (
            <div>
              {donations.slice().reverse().map(d => (
                <div key={d.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid var(--border)',gap:8}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:'.88rem'}}>{d.recipient}</div>
                    <div className="muted" style={{fontSize:'.74rem'}}>
                      <span style={{color:'var(--brass-fg)',fontWeight:600}}>{d.category}</span> · {d.date}
                      {d.taxDeductible && <span style={{color:'var(--success)',marginLeft:6}}>· Tax ✓</span>}
                    </div>
                  </div>
                  <strong style={{color:'var(--brass-fg)',whiteSpace:'nowrap'}}>{fmt(d.amount)}</strong>
                  <button onClick={() => {
                    if(window.confirm(`Delete donation to ${d.recipient}?`))
                      saveDonations(donations.filter(x => x.id !== d.id))
                  }} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',padding:'4px 8px'}}>✕</button>
                </div>
              ))}
            </div>
          )}
        </section>
        </ProTabGate>
        )}

      {tab === 'income' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <section className="card">
          <p className="eyebrow">Income Tracker</p>
          {(() => {
            const mk = incomeView
            const list = incomesForMonth(mk).slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
            const total = incomeTotalForMonth(mk)
            const prevMk = shiftMonth(mk, -1)
            const prevTotal = incomeTotalForMonth(prevMk)
            // Most recent earlier month that has income — used for "copy forward"
            const lastWithIncome = [...new Set(incomes.map(incomeMonthOf))].filter(m => m < mk).sort().pop()
            const inputStyle = {padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}
            const navBtn = {background:'var(--stone)',border:'1px solid var(--border2)',borderRadius:999,width:36,height:36,fontSize:'1.1rem',cursor:'pointer',color:'var(--ink)'}
            return (<>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,margin:'4px 0 14px'}}>
                <button aria-label="Previous month" style={navBtn} onClick={() => setIncomeView(shiftMonth(mk, -1))}>‹</button>
                <div style={{textAlign:'center'}}>
                  <h3 style={{margin:0}}>{monthLabel(mk)}</h3>
                  {mk !== CUR_MONTH && <button onClick={() => setIncomeView(CUR_MONTH)} style={{background:'none',border:'none',color:'var(--brass-fg)',fontSize:'.75rem',fontWeight:600,cursor:'pointer',padding:'2px 0'}}>Back to this month</button>}
                </div>
                <button aria-label="Next month" style={navBtn} onClick={() => setIncomeView(shiftMonth(mk, 1))}>›</button>
              </div>
              <div style={{background:'var(--stone)',borderRadius:10,padding:'14px',marginBottom:16,display:'flex',justifyContent:'space-between',gap:12}}>
                <div>
                  <p className="muted" style={{fontSize:'.75rem',margin:'0 0 2px'}}>{mk === CUR_MONTH ? 'Received so far this month' : `Total for ${monthLabel(mk, { month: 'long' })}`}</p>
                  <strong style={{fontSize:'1.4rem',color:'var(--success)'}}>{fmt(total)}</strong>
                </div>
                <div style={{textAlign:'right'}}>
                  <p className="muted" style={{fontSize:'.75rem',margin:'0 0 2px'}}>{monthLabel(prevMk, { month: 'long' })}</p>
                  <strong style={{fontSize:'1rem'}}>{fmt(prevTotal)}</strong>
                  {prevTotal > 0 && total > 0 && <div style={{fontSize:'.72rem',fontWeight:600,color: total >= prevTotal ? 'var(--success)' : 'var(--danger)'}}>{total >= prevTotal ? '▲' : '▼'} {fmt(Math.abs(total - prevTotal))}</div>}
                </div>
              </div>
              {list.length === 0 && (
                <div style={{textAlign:'center',padding:'8px 0 12px'}}>
                  <EmptyState icon="💵" title={`No income logged for ${monthLabel(mk, { month: 'long' })} yet`} message="Add each paycheck or payment as it comes in." />
                  {lastWithIncome && (
                    <button className="ghost-btn" style={{marginTop:6}} onClick={() => {
                      const copies = incomesForMonth(lastWithIncome).map((inc, k) => ({
                        id: Date.now() + k, label: inc.label, category: inc.category || 'Primary',
                        amount: String(Math.round(incomeInMonth(inc) * 100) / 100), date: defaultIncomeDate(mk), month: mk,
                      }))
                      saveIncomes([...incomes, ...copies])
                    }}>Copy {incomesForMonth(lastWithIncome).length} from {monthLabel(lastWithIncome, { month: 'long' })}</button>
                  )}
                </div>
              )}
              {list.map((inc) => (
                <div key={inc.id || inc.label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid var(--border)',gap:8}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:'.9rem'}}>{inc.label}</div>
                    <div className="muted" style={{fontSize:'.75rem'}}>{inc.category}{inc.date ? ` · ${new Date(`${inc.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}{inc.period && inc.period !== 'monthly' && INCOME_MULT[inc.period] ? ` · ${inc.period}` : ''}</div>
                  </div>
                  <div style={{fontWeight:700,color:'var(--success)',whiteSpace:'nowrap'}}>{fmt(incomeInMonth(inc))}</div>
                  <button aria-label={`Delete ${inc.label}`} onClick={() => { if (window.confirm(`Delete "${inc.label}"?`)) saveIncomes(incomes.filter(x => x !== inc)) }}
                    style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:'1.1rem',padding:'4px 8px'}}>✕</button>
                </div>
              ))}
              <div style={{marginTop:16,display:'grid',gap:8}}>
                <p style={{fontWeight:600,fontSize:'.85rem',margin:0}}>Add income to {monthLabel(mk, { month: 'long' })}</p>
                <input placeholder="Label (e.g. Paycheck, Client session)" value={newIncome.label}
                  onChange={e=>setNewIncome(p=>({...p,label:e.target.value}))} style={inputStyle} />
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  <input placeholder="Amount ($)" type="number" inputMode="decimal" value={newIncome.amount}
                    onChange={e=>setNewIncome(p=>({...p,amount:e.target.value}))} style={inputStyle} />
                  <input type="date" value={newIncome.date} onChange={e=>setNewIncome(p=>({...p,date:e.target.value}))} style={inputStyle} />
                </div>
                <select value={newIncome.category} onChange={e=>setNewIncome(p=>({...p,category:e.target.value}))} style={inputStyle}>
                  {['Primary','Side Hustle','Passive','Investment','Business','Other'].map(c=><option key={c}>{c}</option>)}
                </select>
                <button className="primary-btn" onClick={() => {
                  if (!newIncome.label || !newIncome.amount) return
                  const date = newIncome.date || defaultIncomeDate(mk)
                  saveIncomes([...incomes, { id: Date.now(), label: newIncome.label, amount: newIncome.amount, category: newIncome.category, date, month: date.slice(0, 7) }])
                  if (date.slice(0, 7) !== mk) setIncomeView(date.slice(0, 7))
                  setNewIncome({ label: '', amount: '', category: newIncome.category, date: defaultIncomeDate(date.slice(0, 7)) })
                }}>+ Add Income</button>
              </div>
            </>)
          })()}
        </section>
      </ProTabGate>)}

      {/* ── EXPENSES & BILLS ─────────────────────────────────────────────── */}
      {tab === 'expenses' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <div>
          {/* Bills section — moved here from Budget */}
          <section className="card">
          {/* Subscription Audit */}
          {(() => {
            const subs = bills.filter(b => b.category === 'Subscription' || (b.label||'').toLowerCase().includes('subscription'))
            const totalMonthly = subs.reduce((s,b) => s + billToMonthly(b), 0)
            if (subs.length === 0) return null
            return (
              <div style={{
                background: 'rgba(245,158,11,.08)',
                border: '1.5px solid rgba(245,158,11,.25)',
                borderRadius: 12, padding: '12px 14px', marginBottom: 14,
              }}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                  <p style={{fontSize:'.65rem',fontWeight:700,letterSpacing:'.08em',color:'var(--warning,#D97706)',textTransform:'uppercase',margin:0}}>⚠️ Subscription Audit</p>
                  <strong style={{fontSize:'.85rem',color:'var(--warning,#D97706)'}}>{fmt(totalMonthly)}/mo · {fmt(totalMonthly*12)}/yr</strong>
                </div>
                <p style={{fontSize:'.78rem',color:'var(--ink2)',marginBottom:8}}>
                  You have {subs.length} active subscription{subs.length !== 1 ? 's' : ''}. Review each — is it still earning its keep?
                </p>
                <div style={{display:'grid',gap:4}}>
                  {subs.map(s => (
                    <div key={s.id || s.label} style={{display:'flex',justifyContent:'space-between',fontSize:'.78rem',padding:'4px 0',borderBottom:'1px solid rgba(245,158,11,.15)'}}>
                      <span>{s.label}</span>
                      <span style={{fontWeight:600}}>{fmt(billToMonthly(s))}/mo</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

            <p className="eyebrow">Fixed Bills</p>
            <h3 style={{ margin: '4px 0 10px' }}>Monthly Recurring Expenses</h3>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'2px solid var(--border)',marginBottom:6}}>
              <strong style={{fontSize:'.85rem'}}>Total Monthly Bills</strong>
              <strong style={{color:'var(--danger)',fontSize:'1rem'}}>{fmt(totalBillsMonthly)}</strong>
            </div>
            {bills.length === 0 && <p className="muted" style={{textAlign:'center',padding:'12px 0',fontSize:'.85rem'}}><EmptyState icon="🧾" title="Know what you owe" message="Awareness precedes stewardship. Add what comes due each month." /></p>}
            {bills.map((b, i) => (
              <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
                <div>
                  <span style={{fontWeight:600,fontSize:'.88rem'}}>{b.label}</span>
                  {b.category && <span className="muted" style={{fontSize:'.72rem',marginLeft:6}}>{b.category}</span>}
                  {b.frequency && b.frequency !== 'monthly' && <span style={{fontSize:'.7rem',color:'var(--teal)',marginLeft:6,fontWeight:600}}>· {b.frequency}</span>}
                </div>
                <div style={{display:'flex',gap:10,alignItems:'center'}}>
                  <strong style={{color:'var(--danger)'}}>{fmt(b.amount)}</strong>
                  <button aria-label={`Delete ${b.label}`} onClick={() => { if (window.confirm(`Delete the bill "${b.label}"?`)) saveBills(bills.filter((_,j)=>j!==i)) }}
                    style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}}>✕</button>
                </div>
              </div>
            ))}
            <div style={{marginTop:12,display:'grid',gap:8}}>
              <p style={{fontWeight:600,fontSize:'.82rem',margin:0}}>Add a Bill</p>
              <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:8}}>
                <input placeholder="Bill name (e.g. Rent, Electric)" value={newBill.label}
                  onChange={e=>setNewBill(p=>({...p,label:e.target.value}))}
                  style={{padding:'8px 10px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.82rem'}} />
                <input type="number" placeholder="$ amount" value={newBill.amount}
                  onChange={e=>setNewBill(p=>({...p,amount:e.target.value}))}
                  style={{padding:'8px 10px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.82rem'}} />
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                <select value={newBill.category} onChange={e=>setNewBill(p=>({...p,category:e.target.value}))}
                  style={{padding:'8px 10px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.82rem'}}>
                  {['Need','Utility','Insurance','Subscription','Debt Payment','Other'].map(c=><option key={c}>{c}</option>)}
                </select>
                <select value={newBill.frequency||'monthly'} onChange={e=>setNewBill(p=>({...p,frequency:e.target.value}))}
                  style={{padding:'8px 10px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.82rem'}}>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Bi-weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <button className="primary-btn" onClick={() => {
                if (!newBill.label || !newBill.amount) return
                saveBills([...bills, { ...newBill, id: Date.now() }])
                setNewBill({ label: '', amount: '', category: 'Need', frequency: 'monthly' })
              }}>+ Add Bill</button>
            </div>
          </section>

          {/* Variable expenses from expense log */}
          <section className="card">
            <p className="eyebrow">Variable Expenses</p>
            <h3 style={{ margin: '4px 0 10px' }}>Tracked Spending</h3>

            {/* Quick Tap Categories */}
            {!addingExpense && (
              <div style={{marginBottom:14}}>
                <p style={{fontSize:'.72rem',color:'var(--ink2)',fontWeight:600,letterSpacing:'.06em',textTransform:'uppercase',marginBottom:8}}>Quick Add</p>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(76px, 1fr))',gap:8,marginBottom:10}}>
                  {[
                    {icon:'🛒', label:'Groceries', cat:'Food'},
                    {icon:'⛽', label:'Gas', cat:'Transport'},
                    {icon:'🍔', label:'Eating Out', cat:'Food'},
                    {icon:'☕', label:'Coffee', cat:'Food'},
                    {icon:'🛍', label:'Shopping', cat:'Shopping'},
                    {icon:'🎬', label:'Fun', cat:'Entertainment'},
                    {icon:'💊', label:'Health', cat:'Health'},
                    {icon:'🏠', label:'Home', cat:'Home'},
                  ].map(({icon, label, cat}) => (
                    <button key={label} onClick={() => {
                      setNewExpense({desc:label, amount:'', category:cat, period:'one-time', date:TODAY})
                      setAddingExpense(true)
                    }} style={{
                      display:'flex', flexDirection:'column', alignItems:'center', gap:4,
                      padding:'10px 6px', borderRadius:12, background:'var(--stone)',
                      border:'1.5px solid var(--border2)', cursor:'pointer',
                      transition:'all .15s',
                    }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--teal)'; e.currentTarget.style.background = 'var(--stone2)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.background = 'var(--stone)' }}
                    >
                      <div style={{fontSize:'1.4rem'}}>{icon}</div>
                      <div style={{fontSize:'.7rem',color:'var(--ink2)',fontWeight:600,textAlign:'center'}}>{label}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quick add variable expense */}
            {!addingExpense ? (
              <button onClick={() => setAddingExpense(true)} style={{
                width:'100%', padding:'9px', borderRadius:10, marginBottom:12,
                border:'1.5px dashed var(--border2)', background:'transparent',
                color:'var(--teal)', fontWeight:600, fontSize:'.88rem', cursor:'pointer'
              }}>+ Custom Expense</button>
            ) : (
              <div style={{background:'var(--stone)',borderRadius:12,padding:14,marginBottom:14,display:'grid',gap:8}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  <input placeholder="Description" value={newExpense.desc} onChange={e=>setNewExpense(p=>({...p,desc:e.target.value}))}
                    style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:8,fontSize:'.88rem'}} />
                  <input placeholder="Amount" type="number" value={newExpense.amount} onChange={e=>setNewExpense(p=>({...p,amount:e.target.value}))}
                    style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:8,fontSize:'.88rem'}} />
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  <select value={newExpense.category} onChange={e=>setNewExpense(p=>({...p,category:e.target.value}))}
                    style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:8,fontSize:'.88rem'}}>
                    {['Food','Transport','Shopping','Entertainment','Health','Personal','Home','Other'].map(c=><option key={c}>{c}</option>)}
                  </select>
                  <select value={newExpense.period||'one-time'} onChange={e=>setNewExpense(p=>({...p,period:e.target.value}))}
                    style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:8,fontSize:'.88rem'}}>
                    <option value="one-time">One-time</option>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Bi-weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
                <input type="date" value={newExpense.date} onChange={e=>setNewExpense(p=>({...p,date:e.target.value}))}
                  style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:8,fontSize:'.88rem'}} />
                <div style={{display:'flex',gap:8}}>
                  <button onClick={()=>{
                    if(!newExpense.desc||!newExpense.amount) return
                    saveItem('expense',{description:newExpense.desc,amount:Number(newExpense.amount),
                      category:newExpense.category,period:newExpense.period||'one-time',date:newExpense.date||TODAY},'create')
                    setNewExpense({desc:'',amount:'',category:'Food',period:'one-time',date:TODAY})
                    setAddingExpense(false)
                  }} style={{flex:1,padding:'10px',background:'var(--teal)',color:'white',border:'none',borderRadius:8,fontWeight:600,cursor:'pointer'}}>
                    Save
                  </button>
                  <button onClick={()=>setAddingExpense(false)} style={{flex:1,padding:'10px',background:'var(--stone)',border:'1px solid var(--border2)',borderRadius:8,cursor:'pointer'}}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <PeriodPills />
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16}}>
              {[
                ['This Week', fmt(fpWeekSpend)],
                ['This Month', fmt(fpMonthSpend)],
                ['Quarterly Est.', fmt(fpWeekSpend * 13)],
                ['Yearly Est.', fmt(fpWeekSpend * 52)],
              ].map(([label, val]) => (
                <div key={label} style={{background:'var(--stone)',borderRadius:10,padding:'12px',textAlign:'center'}}>
                  <p className="muted" style={{fontSize:'.72rem',margin:'0 0 4px'}}>{label}</p>
                  <strong style={{fontSize:'1.05rem',color:'var(--danger)'}}>{val}</strong>
                </div>
              ))}
            </div>
            {(expenses||[]).length === 0 && <p className="muted" style={{textAlign:'center',padding:'12px 0'}}><EmptyState icon="💳" title="No expenses yet" message="Log your first expense to start tracking spending." /></p>}
            {(expenses||[]).length > 0 && <p className="muted" style={{fontSize:'.75rem',margin:'0 0 4px'}}>Tap an expense to edit it.</p>}
            {(expenses||[]).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,expLimit).map((exp, i) => (
              <ExpenseRow key={exp.id || i} {...expenseRowProps(exp)} />
            ))}
            {(expenses||[]).length > expLimit && (
              <button type="button" className="ghost-btn" style={{width:'100%',marginTop:8}} onClick={() => setExpLimit((n) => n + 30)}>
                Show more ({(expenses||[]).length - expLimit} older)
              </button>
            )}
            {(expenses||[]).length > 0 && (() => {
              // This month: one-time spending dated this month + the monthly share of repeating expenses
              const cats = {}
              expenses.forEach(e => {
                const p = e.period || 'one-time'
                const amt = p === 'one-time' ? (e.date && e.date.slice(0, 7) === TODAY.slice(0, 7) ? Number(e.amount || 0) : 0) : (!e.date || e.date <= TODAY ? toWeekly(e) * 4.33 : 0)
                if (amt) cats[e.category || 'Other'] = (cats[e.category || 'Other'] || 0) + amt
              })
              const total = Object.values(cats).reduce((s,v)=>s+v,0)
              if (!total) return null
              return (
                <div style={{marginTop:16}}>
                  <p style={{fontWeight:600,fontSize:'.85rem',marginBottom:10}}>By Category · {monthLabel(CUR_MONTH, { month: 'long' })}</p>
                  {Object.entries(cats).sort((a,b)=>b[1]-a[1]).map(([cat,amt]) => (
                    <div key={cat} style={{marginBottom:8}}>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                        <span style={{fontSize:'.82rem'}}>{cat}</span>
                        <span style={{fontSize:'.82rem',fontWeight:600}}>{fmt(amt)}</span>
                      </div>
                      <div style={{height:6,borderRadius:999,background:'var(--border)'}}>
                        <div style={{height:'100%',borderRadius:999,background:'var(--brass)',width:`${(amt/total)*100}%`}} />
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()}
          </section>
        </div>
      </ProTabGate>)}

      {/* ── SAVINGS ──────────────────────────────────────────────────────── */}
      {tab === 'savings' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <div>
          <section className="card">
          {/* Sinking Funds */}
          <div style={{marginBottom:16}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
              <p style={{fontSize:'.72rem',color:'var(--ink2)',fontWeight:600,letterSpacing:'.06em',textTransform:'uppercase',margin:0}}>Sinking Funds</p>
              <button onClick={() => setShowSinkingForm(!showSinkingForm)} style={{
                fontSize:'.72rem',padding:'4px 10px',borderRadius:999,
                background:'transparent',color:'var(--teal)',border:'1px solid var(--teal)',
                cursor:'pointer',fontWeight:600,
              }}>{showSinkingForm ? 'Cancel' : '+ New'}</button>
            </div>
            <p className="muted" style={{fontSize:'.74rem',marginBottom:10,fontStyle:'italic'}}>
              Save monthly for known future expenses (Christmas, car repair, vacation).
            </p>

            {showSinkingForm && (
              <div className="sav-new">
                <label>Fund name<input placeholder="Christmas 2026" value={newSinking.name} onChange={e => setNewSinking(p => ({...p, name: e.target.value}))} /></label>
                <div className="sav-new-row">
                  <label>Target amount<input type="text" inputMode="decimal" placeholder="$0" value={newSinking.target} onChange={e => setNewSinking(p => ({...p, target: e.target.value}))} /></label>
                  <label><span>Already saved <span className="muted">(optional)</span></span><input type="text" inputMode="decimal" placeholder="$0" value={newSinking.current} onChange={e => setNewSinking(p => ({...p, current: e.target.value}))} /></label>
                </div>
                <label><span>Due date <span className="muted">(for a monthly amount)</span></span><input type="date" value={newSinking.dueDate} onChange={e => setNewSinking(p => ({...p, dueDate: e.target.value}))} /></label>
                <button className="primary-btn" onClick={() => {
                  const target = parseMoney(newSinking.target), current = money2(Math.max(0, parseMoney(newSinking.current)))
                  if (!newSinking.name.trim() || !(target > 0)) return
                  saveSinkingFunds([...sinkingFunds, { id: Date.now(), name: newSinking.name.trim(), target, current, dueDate: newSinking.dueDate,
                    history: current > 0 ? [{ id: Date.now(), date: TODAY, amount: current, note: 'Starting balance' }] : [] }])
                  setNewSinking({name:'', target:'', current:'', dueDate:''})
                  setShowSinkingForm(false)
                }}>Add Fund</button>
              </div>
            )}

            {sinkingFunds.map(f => (
              <SavingsItem key={f.id} name={f.name} target={f.target} current={f.current} dueDate={f.dueDate} history={f.history || []}
                color="var(--teal)" fmt={fmt}
                onUpdate={(patch) => saveSinkingFunds(sinkingFunds.map(x => x.id === f.id ? { ...x, ...patch } : x))}
                onDelete={() => saveSinkingFunds(sinkingFunds.filter(x => x.id !== f.id))} />
            ))}
          </div>

            <p className="eyebrow">Savings Challenge</p>
            <h3 style={{ margin: '4px 0 6px' }}>Build Your Savings — Your Way</h3>

            {/* Challenge selector */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:16}}>
              {[
                {goal:1000, label:'$1,000', timeLabel:'30 Days', type:'daily', periods:30, color:'#256A2A'},
                {goal:3000, label:'$3,000', timeLabel:'3 Months', type:'weekly', periods:13, color:'#2196F3'},
                {goal:5000, label:'$5,000', timeLabel:'6 Months', type:'biweekly', periods:26, color:'#8F5300'},
                {goal:10000, label:'$10,000', timeLabel:'52 Weeks', type:'weekly52', periods:52, color:'#9C27B0'},
              ].map(cfg => {
                const isActive = challengeGoal === cfg.goal
                return (
                  <button key={cfg.goal} onClick={() => {
                    if (isActive) return
                    if (checkedWeeks.length && !window.confirm(`Switch to the ${cfg.label} challenge? Your ${checkedWeeks.length} checked ${checkedWeeks.length === 1 ? 'box' : 'boxes'} on the current one will be cleared.`)) return
                    saveChallengeGoal(cfg.goal); saveCheckedWeeks([])
                  }}
                    style={{
                      padding:'14px 10px', borderRadius:12, cursor:'pointer', textAlign:'center',
                      border: isActive ? `2px solid ${cfg.color}` : '1.5px solid var(--border)',
                      background: isActive ? cfg.color+'18' : 'var(--stone)',
                      transition:'all .2s'
                    }}>
                    <div style={{fontSize:'1.2rem',fontWeight:800,color:isActive?cfg.color:'var(--ink)'}}>{cfg.label}</div>
                    <div style={{fontSize:'.75rem',color:'var(--muted)',marginTop:2}}>in {cfg.timeLabel}</div>
                    {isActive && <div style={{fontSize:'.68rem',color:cfg.color,marginTop:4,fontWeight:600}}>✓ Active</div>}
                  </button>
                )
              })}
            </div>

            {/* Dynamic challenge based on selection */}
            {(() => {
              const CHALLENGES = {
                1000: {
                  goal: 1000, label: '$1,000 in 30 Days', color: '#256A2A', type: 'daily',
                  desc: 'Save every day for 30 days. Tap each day as you set money aside.',
                  unitLabel: 'Day', gridCols: 'repeat(6,1fr)',
                  // 30 amounts averaging $33.33/day that add to exactly $1000
                  amounts: [25,30,35,40,25,30,35,40,25,30,35,25,40,30,35,25,40,35,30,25,40,35,30,40,25,35,30,40,35,55]
                },
                3000: {
                  goal: 3000, label: '$3,000 in 3 Months', color: '#2196F3', type: 'weekly',
                  desc: 'Save each week for 13 weeks. Consistency beats intensity.',
                  unitLabel: 'Week', gridCols: 'repeat(4,1fr)',
                  // 13 weekly amounts totaling $3000 (~$230/wk), escalating pattern
                  amounts: [175,200,200,225,225,225,250,250,250,250,250,250,250]
                },
                5000: {
                  goal: 5000, label: '$5,000 in 6 Months', color: '#8F5300', type: 'biweekly',
                  desc: 'Save every 2 weeks for 26 periods. Pairs perfectly with bi-weekly pay.',
                  unitLabel: 'Period', gridCols: 'repeat(4,1fr)',
                  // 26 bi-weekly amounts totaling $5000 (~$192/period), escalating
                  amounts: [150,150,175,175,175,175,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200]
                },
                10000: {
                  goal: 10000, label: '$10,000 in 52 Weeks', color: '#9C27B0', type: 'weekly52',
                  desc: 'The classic 52-week challenge. Current week highlighted.',
                  unitLabel: 'Week', gridCols: 'repeat(4,1fr)',
                  amounts: WEEK_PLAN
                },
              }

              const cfg = CHALLENGES[challengeGoal] || CHALLENGES[10000]
              const totalSaved = checkedWeeks.reduce((s, w) => s + (cfg.amounts[w-1] || 0), 0)
              const pct = Math.min((totalSaved / cfg.goal) * 100, 100)
              const remaining = cfg.goal - totalSaved
              const periodsLeft = cfg.amounts.length - checkedWeeks.length
              const avgNeeded = periodsLeft > 0 ? remaining / periodsLeft : 0

              return (
                <div>
                  <div style={{background:'var(--stone)',borderRadius:10,padding:'14px',marginBottom:12}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
                      <div>
                        <p style={{fontWeight:700,color:'var(--ink)',margin:'0 0 2px'}}>{cfg.label}</p>
                        <p className="muted" style={{fontSize:'.78rem',margin:0}}>{cfg.desc}</p>
                      </div>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:10}}>
                      {[
                        ['Saved', '$'+totalSaved.toLocaleString(), cfg.color],
                        ['Remaining', '$'+remaining.toLocaleString(), 'var(--danger)'],
                        ['Avg/period', '$'+avgNeeded.toFixed(0), 'var(--brass-fg)'],
                      ].map(([l,v,c]) => (
                        <div key={l} style={{textAlign:'center',background:'white',borderRadius:8,padding:'8px 4px'}}>
                          <div className="muted" style={{fontSize:'.68rem',marginBottom:2}}>{l}</div>
                          <strong style={{color:c,fontSize:'1rem'}}>{v}</strong>
                        </div>
                      ))}
                    </div>
                    <div style={{height:10,borderRadius:999,background:'var(--border)'}}>
                      <div style={{height:'100%',borderRadius:999,background:cfg.color,width:`${pct}%`,transition:'width .3s'}} />
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',marginTop:4}}>
                      <span className="muted" style={{fontSize:'.72rem'}}>{pct.toFixed(1)}% complete</span>
                      <span className="muted" style={{fontSize:'.72rem'}}>{checkedWeeks.length} of {cfg.amounts.length} {cfg.unitLabel.toLowerCase()}s done</span>
                    </div>
                  </div>

                  {cfg.type === 'weekly52' && (
                    <p className="muted" style={{fontSize:'.78rem',marginBottom:8}}>
                      Current: <strong style={{color:cfg.color}}>Week {currentWeekNum}</strong> — tap to mark saved
                    </p>
                  )}

                  <div style={{display:'grid',gridTemplateColumns:cfg.gridCols,gap:5}}>
                    {cfg.amounts.map((amt, i) => {
                      const period = i + 1
                      const done = checkedWeeks.includes(period)
                      const isCurrent = cfg.type === 'weekly52' && period === currentWeekNum
                      return (
                        <button key={period} onClick={() => toggleWeek(period)} style={{
                          padding: cfg.type==='daily' ? '6px 2px' : '8px 4px',
                          borderRadius: cfg.type==='daily' ? '50%' : 8,
                          border: isCurrent ? `2px solid ${cfg.color}` : '1px solid var(--border)',
                          background: done ? cfg.color : 'var(--stone)',
                          color: done ? 'white' : 'var(--ink)', cursor:'pointer',
                          fontSize:'.68rem', fontWeight:600, lineHeight:1.3,
                          aspectRatio: cfg.type==='daily' ? '1' : 'auto',
                          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                          boxShadow: isCurrent ? `0 0 0 2px ${cfg.color}33` : 'none'
                        }}>
                          <div style={{fontSize:'.6rem',opacity:0.7}}>{cfg.unitLabel.charAt(0)}{period}</div>
                          <div>${amt}</div>
                        </button>
                      )
                    })}
                  </div>

                  <button onClick={() => saveCheckedWeeks([])}
                    style={{marginTop:12,background:'none',border:'1px solid var(--border)',borderRadius:8,padding:'6px 14px',
                    fontSize:'.78rem',color:'var(--muted)',cursor:'pointer',width:'100%'}}>
                    Reset Challenge
                  </button>
                </div>
              )
            })()}
          </section>

          {/* Savings Goals */}
          <section className="card">
            <p className="eyebrow">Savings Goals</p>
            <h3 style={{ margin: '4px 0 14px' }}>What You're Building Toward</h3>
            <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderBottom:'2px solid var(--border)',marginBottom:10}}>
              <strong>Total Saved Across All Goals</strong>
              <strong style={{color:'var(--success)'}}>{fmt(totalSavingsStored)}</strong>
            </div>
            {savingsGoals.map((sg) => (
              <SavingsItem key={sg.id} name={sg.label} target={sg.goal} current={sg.current} dueDate={sg.targetDate} history={sg.history || []}
                color={sg.color || 'var(--brass-fg)'} fmt={fmt} monthlyIncome={totalWeeklyIncome * 4.33}
                onUpdate={({ name, target, dueDate, ...rest }) => saveSavingsGoals(savingsGoals.map((g) => g.id !== sg.id ? g : {
                  ...g, ...rest,
                  ...(name !== undefined ? { label: name } : {}), ...(target !== undefined ? { goal: target } : {}), ...(dueDate !== undefined ? { targetDate: dueDate } : {}),
                }))}
                onDelete={() => saveSavingsGoals(savingsGoals.filter((g) => g.id !== sg.id))} />
            ))}
            <div className="sav-new">
              <p className="sav-new-title">New Savings Goal</p>
              <label>Goal name<input placeholder="House down payment" value={newSavings.label} onChange={e=>setNewSavings(p=>({...p,label:e.target.value}))} /></label>
              <div className="sav-new-row">
                <label>Goal amount<input type="text" inputMode="decimal" placeholder="$0" value={newSavings.goal} onChange={e=>setNewSavings(p=>({...p,goal:e.target.value}))} /></label>
                <label><span>Already saved <span className="muted">(optional)</span></span><input type="text" inputMode="decimal" placeholder="$0" value={newSavings.current} onChange={e=>setNewSavings(p=>({...p,current:e.target.value}))} /></label>
              </div>
              <label><span>Target date <span className="muted">(optional)</span></span><input type="date" value={newSavings.targetDate} onChange={e=>setNewSavings(p=>({...p,targetDate:e.target.value}))} /></label>
              <button className="primary-btn" onClick={() => {
                const goal = parseMoney(newSavings.goal), current = money2(Math.max(0, parseMoney(newSavings.current)))
                if (!newSavings.label.trim() || !(goal > 0)) return
                saveSavingsGoals([...savingsGoals, { id: Date.now(), label: newSavings.label.trim(), goal, current, targetDate: newSavings.targetDate, color: 'var(--brass-fg)',
                  history: current > 0 ? [{ id: Date.now(), date: TODAY, amount: current, note: 'Starting balance' }] : [] }])
                setNewSavings({ label: '', goal: '', current: '', targetDate: '' })
              }}>+ Add Goal</button>
              <p className="muted sav-new-tip">After it's created, use <strong>+ Add money</strong> on the goal each time you set money aside.</p>
            </div>
          </section>
        </div>
      </ProTabGate>)}
      {tab === 'debt' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <section className="card debt-card">
          <p className="eyebrow">Debt Tracker</p>
          <h3 style={{ margin: '4px 0 6px' }}>Debt Avalanche — Highest Rate First</h3>
          <p className="muted" style={{fontSize:'.8rem',marginBottom:14}}>Pay minimums on all debts, then throw every extra dollar at the highest interest rate first.</p>
          {debts.length > 0 && (
            <div className="debt-summary" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(130px, 1fr))',gap:8,marginBottom:12}}>
              {[
                ['Total Balance', fmt(debtTotals.balance), 'var(--danger)'],
                ['Min Payments', `${fmt(totalDebtPayments)}/mo`, 'var(--danger)'],
                debtTotals.limit > 0 ? ['Credit Available', fmt(debtTotals.available), 'var(--success)'] : null,
                debtTotals.limit > 0 ? ['Card Utilization', `${Math.round((debtTotals.cardBalance / debtTotals.limit) * 100)}%`, utilTone((debtTotals.cardBalance / debtTotals.limit) * 100)] : null,
              ].filter(Boolean).map(([label, val, col]) => (
                <div key={label} style={{background:'var(--stone)',borderRadius:10,padding:'10px 12px'}}>
                  <p className="muted" style={{fontSize:'.68rem',margin:'0 0 3px',textTransform:'uppercase',letterSpacing:'.05em'}}>{label}</p>
                  <strong style={{color:col,fontSize:'1rem'}}>{val}</strong>
                </div>
              ))}
            </div>
          )}
          {debts.length === 0 && <p className="muted" style={{textAlign:'center',padding:'20px 0'}}><EmptyState icon="📉" title="No debts added" message="Track what you owe and build a payoff plan." /></p>}
          {/* Sorted by rate for display; edits/deletes match the debt itself (deleting by sorted position removed the wrong one) */}
          {[...debts].sort((a, b) => Number(b.rate || 0) - Number(a.rate || 0)).map((debt, i) => {
            const editing = editingDebt && editingDebt.ref === debt
            const patch = (fields) => saveDebts(debts.map((d) => d === debt ? { ...d, ...fields } : d))
            const type = debtTypeOf(debt)
            const bal = Number(debt.balance) || 0, lim = Number(debt.limit) || 0
            const util = lim > 0 ? (Math.max(0, bal) / lim) * 100 : null
            const startEdit = () => setEditingDebt({ ref: debt, type, name: debt.name || '', balance: debt.balance ?? '', limit: debt.limit ?? '', rate: debt.rate ?? '', minPayment: debt.minPayment ?? '' })
            return (
            <div key={debt.id || i} className="debt-row" style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 }}>
                <strong style={{ fontSize: '.9rem', minWidth: 0 }}>
                  {i === 0 && debts.length > 1 ? '🎯 ' : ''}{debt.name}
                  <span className="debt-type-tag" style={{ marginLeft: 8, fontSize: '.62rem', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--ink2)', background: 'var(--stone2)', borderRadius: 999, padding: '2px 7px', verticalAlign: 'middle' }}>{type === 'card' ? 'Card' : 'Loan'}</span>
                </strong>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button className="ghost-btn" style={{ fontSize: '.72rem', padding: '4px 8px' }} onClick={() => editing ? setEditingDebt(null) : startEdit()}>{editing ? 'Cancel' : 'Update'}</button>
                  <button aria-label={`Delete ${debt.name}`} onClick={() => { if (window.confirm(`Delete "${debt.name}"?`)) saveDebts(debts.filter((d) => d !== debt)) }}
                    style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>✕</button>
                </div>
              </div>
              {editing ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.4fr)', gap: 8 }}>
                    <label style={{ fontSize: '.7rem' }}>Type
                      <select value={editingDebt.type} onChange={(e) => setEditingDebt((p) => ({ ...p, type: e.target.value }))}>
                        {DEBT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </label>
                    <label style={{ fontSize: '.7rem' }}>Name<input value={editingDebt.name} onChange={(e) => setEditingDebt((p) => ({ ...p, name: e.target.value }))} /></label>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: editingDebt.type === 'card' ? 'repeat(2, minmax(0,1fr))' : 'repeat(3, minmax(0,1fr))', gap: 8 }}>
                    {[['Balance $', 'balance'], ...(editingDebt.type === 'card' ? [['Credit limit $', 'limit']] : []), ['Rate %', 'rate'], ['Min Pmt $', 'minPayment']].map(([ph, key]) => (
                      <label key={key} style={{ fontSize: '.7rem' }}>{ph}<input type="number" inputMode="decimal" value={editingDebt[key] ?? ''} onChange={(e) => setEditingDebt((p) => ({ ...p, [key]: e.target.value }))} /></label>
                    ))}
                  </div>
                  <button className="primary-btn" onClick={() => {
                    const e = editingDebt
                    patch({ type: e.type, name: e.name.trim() || debt.name, balance: e.balance, rate: e.rate, minPayment: e.minPayment, limit: e.type === 'card' ? e.limit : '', updatedAt: TODAY })
                    setEditingDebt(null)
                  }}>Save</button>
                  {Number(editingDebt.balance) <= 0 && <p className="muted" style={{ fontSize: '.75rem', margin: 0 }}>Paid off? Save it at $0 to celebrate, or delete it.</p>}
                </div>
              ) : (
              <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: '.8rem' }}>
                <div><p className="muted" style={{margin:'0 0 2px',fontSize:'.7rem'}}>BALANCE</p><strong style={bal <= 0 ? { color: 'var(--success)' } : undefined}>{bal <= 0 ? 'Paid off ✓' : fmt(debt.balance)}</strong></div>
                <div><p className="muted" style={{margin:'0 0 2px',fontSize:'.7rem'}}>RATE</p><strong style={{color:'var(--danger)'}}>{debt.rate || 0}%</strong></div>
                <div><p className="muted" style={{margin:'0 0 2px',fontSize:'.7rem'}}>MIN PMT</p><strong>{fmt(debt.minPayment)}/mo</strong></div>
              </div>
              {type === 'card' && (lim > 0 ? (
                <div className="debt-credit" style={{ marginTop: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: '.8rem', marginBottom: 6 }}>
                    <div><p className="muted" style={{margin:'0 0 2px',fontSize:'.7rem'}}>LIMIT</p><strong>{fmt(lim)}</strong></div>
                    <div><p className="muted" style={{margin:'0 0 2px',fontSize:'.7rem'}}>AVAILABLE</p><strong style={{ color: bal > lim ? 'var(--danger)' : 'var(--success)' }}>{bal > lim ? `-${fmt(bal - lim)}` : fmt(lim - Math.max(0, bal))}</strong></div>
                    <div><p className="muted" style={{margin:'0 0 2px',fontSize:'.7rem'}}>USED</p><strong style={{ color: utilTone(util) }}>{Math.round(util)}%</strong></div>
                  </div>
                  <div style={{ height: 6, background: 'var(--stone2)', borderRadius: 999, overflow: 'hidden' }} role="img" aria-label={`${Math.round(util)}% of the credit limit used`}>
                    <div style={{ height: '100%', width: `${Math.min(100, util)}%`, background: utilTone(util), borderRadius: 999 }} />
                  </div>
                  {bal > lim && <p style={{ fontSize: '.72rem', color: 'var(--danger)', margin: '4px 0 0', fontWeight: 600 }}>Over the limit by {fmt(bal - lim)}</p>}
                </div>
              ) : (
                <button type="button" className="ghost-btn" style={{ fontSize: '.74rem', padding: '5px 10px', marginTop: 8 }} onClick={startEdit}>+ Add credit limit to see available credit</button>
              ))}
              </>
              )}
            </div>
            )
          })}
          <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
            <p style={{ fontWeight: 600, fontSize: '.85rem', margin: 0 }}>Add a Debt</p>
            <div className="pill-row" role="radiogroup" aria-label="Debt type" style={{ gap: 6 }}>
              {DEBT_TYPES.map(([v, l]) => (
                <button key={v} type="button" role="radio" aria-checked={newDebt.type === v} className={newDebt.type === v ? 'pill active-pill' : 'pill'} style={{ fontSize: '.78rem' }}
                  onClick={() => setNewDebt((p) => ({ ...p, type: v }))}>{l}</button>
              ))}
            </div>
            <input placeholder={newDebt.type === 'card' ? 'Card name (e.g. Chase Visa)' : 'Loan name (e.g. Car Loan, Student Loan)'} value={newDebt.name}
              onChange={e => setNewDebt(p => ({ ...p, name: e.target.value }))}
              style={{ padding: '9px 12px', border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', fontSize: '.85rem' }} />
            <div style={{ display: 'grid', gridTemplateColumns: newDebt.type === 'card' ? 'repeat(2, minmax(0,1fr))' : 'repeat(3, minmax(0,1fr))', gap: 8 }}>
              {[['Balance $', 'balance'], ...(newDebt.type === 'card' ? [['Credit limit $', 'limit']] : []), ['Rate %', 'rate'], ['Min Pmt $', 'minPayment']].map(([ph, key]) => (
                <input key={key} type="number" inputMode="decimal" placeholder={ph} aria-label={ph.replace(/ [$%]$/, '')} value={newDebt[key]}
                  onChange={e => setNewDebt(p => ({ ...p, [key]: e.target.value }))}
                  style={{ padding: '9px 12px', border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', fontSize: '.85rem' }} />
              ))}
            </div>
            <button className="primary-btn" onClick={() => {
              if (!newDebt.name.trim()) return
              saveDebts([...debts, { ...newDebt, name: newDebt.name.trim(), limit: newDebt.type === 'card' ? newDebt.limit : '', id: Date.now() }])
              setNewDebt((p) => ({ ...BLANK_DEBT, type: p.type }))
            }}>+ Add {newDebt.type === 'card' ? 'Card' : 'Loan'}</button>
          </div>
        </section>
      </ProTabGate>)}

      {/* ── BUDGET PLAN ──────────────────────────────────────────────────── */}
      {tab === 'budget' && (
        <div>
          {/* Spending budget: daily, weekly or monthly (discretionary cap) */}
          <section className="card budget-card">
            <p className="eyebrow">Spending Budget</p>
            <h3 style={{margin:'4px 0 6px'}}>{budInfo.label} Budget</h3>
            <p className="muted" style={{fontSize:'.8rem',marginBottom:10}}>
              Everyday spending — bills and rent don't count. Choose the window that matches how you think about money. Your Life Score uses the weekly equivalent.
            </p>
            <div className="pill-row" role="radiogroup" aria-label="Budget period" style={{marginBottom:10,gap:6}}>
              {Object.entries(BUDGET_PERIODS).map(([p, info]) => (
                <button key={p} type="button" role="radio" aria-checked={bud.period === p} className={bud.period === p ? 'pill active-pill' : 'pill'} style={{fontSize:'.8rem'}}
                  onClick={() => { if (p !== bud.period) saveBudgetSafe({ period: p, amount: convertBudget(bud.amount, bud.period, p) }) }}>{info.label}</button>
              ))}
            </div>
            <div style={{display:'flex',gap:10,alignItems:'center'}}>
              <span className="muted" style={{fontSize:'.95rem'}}>$</span>
              <input type="number" inputMode="decimal" min="0" value={targetDraft} aria-label={`${budInfo.label} budget amount`}
                onChange={(e) => setTargetDraft(e.target.value)}
                onBlur={() => { const n = Number(targetDraft); if (targetDraft !== '' && Number.isFinite(n) && n >= 0 && n !== bud.amount) saveBudgetSafe({ period: bud.period, amount: n }); else setTargetDraft(String(bud.amount)) }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                style={{flex:1,padding:'10px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.9rem'}} />
              <span className="muted" style={{fontSize:'.85rem'}}>{budInfo.per}</span>
            </div>
            {bud.amount > 0 && (
              <p className="muted budget-equiv" style={{fontSize:'.74rem',margin:'6px 0 0'}}>
                About {Object.keys(BUDGET_PERIODS).filter((p) => p !== bud.period).map((p) => `${fmt(bud.amount * budInfo.perWeek / BUDGET_PERIODS[p].perWeek)}${BUDGET_PERIODS[p].per}`).join(' · ')}
              </p>
            )}
            {bud.amount > 0 && (() => {
              const spent = budSpend.total, left = bud.amount - spent, over = left < 0
              const daysLeft = Math.max(1, Math.round((new Date(`${budSpend.to}T12:00:00`) - new Date(`${TODAY}T12:00:00`)) / 864e5) + 1)
              return (
                <div className="budget-progress" style={{marginTop:12}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:4,fontSize:'.78rem'}}>
                    <span className="muted">Spent {budInfo.span}</span>
                    <strong style={{color: over ? 'var(--danger)' : 'var(--ink)'}}>{fmt(spent)} / {fmt(bud.amount)}</strong>
                  </div>
                  <div style={{height:6,background:'var(--stone2)',borderRadius:999,overflow:'hidden'}}>
                    <div style={{height:'100%',width:`${Math.min(100, (spent / bud.amount) * 100)}%`,background: over ? 'var(--danger)' : 'var(--teal)',borderRadius:999,transition:'width .3s'}} />
                  </div>
                  <p className="budget-left" style={{fontSize:'.78rem',margin:'6px 0 0',color: over ? 'var(--danger)' : 'var(--ink2)',fontWeight:600}}>
                    {over ? `${fmt(-left)} over ${budInfo.span}`
                      : bud.period === 'daily' ? `${fmt(left)} left today`
                      : `${fmt(left)} left · ${daysLeft} day${daysLeft === 1 ? '' : 's'} to go (about ${fmt(left / daysLeft)} a day)`}
                  </p>
                  {budSpend.repeating > 0 && (
                    <p className="muted" style={{fontSize:'.72rem',margin:'4px 0 0'}}>Includes {fmt(budSpend.repeating)} as the {bud.period === 'daily' ? 'daily' : bud.period === 'monthly' ? 'monthly' : 'weekly'} share of repeating expenses.</p>
                  )}
                </div>
              )
            })()}
            {(() => {
              // What's counted in this day/week/month — tap one to fix it
              const counted = (expenses || []).filter((e) => (e.period || 'one-time') === 'one-time' ? e.date && e.date >= budSpend.from && e.date <= budSpend.to : !e.date || e.date <= budSpend.to)
                .sort((a, b) => ((a.period || 'one-time') === 'one-time' ? 0 : 1) - ((b.period || 'one-time') === 'one-time' ? 0 : 1) || (b.date || '').localeCompare(a.date || ''))
              if (!counted.length) return <p className="muted" style={{fontSize:'.78rem',margin:'12px 0 0'}}>Nothing logged {budInfo.span} yet. Add spending with the + button.</p>
              const shown = budListAll ? counted : counted.slice(0, 6)
              const scale = bud.period === 'daily' ? 1 / 7 : bud.period === 'monthly' ? 4.33 : 1
              return (
                <div className="budget-counted" style={{marginTop:14}}>
                  <p style={{fontWeight:600,fontSize:'.8rem',margin:'0 0 2px'}}>Counted {budInfo.span} <span className="muted" style={{fontWeight:400}}>· tap to edit</span></p>
                  {shown.map((exp, i) => (
                    <ExpenseRow key={exp.id || i} {...expenseRowProps(exp)}
                      extra={(exp.period || 'one-time') !== 'one-time' ? <span> · counts {fmt(expenseWeeklyShare(exp) * scale)}</span> : null} />
                  ))}
                  {counted.length > shown.length && (
                    <button type="button" className="ghost-btn" style={{width:'100%',marginTop:8}} onClick={() => setBudListAll(true)}>Show all {counted.length}</button>
                  )}
                </div>
              )
            })()}
          </section>

          {/* Summary pulled from all tabs */}
          <section className="card">
            <p className="eyebrow">Budget Plan</p>
            <h3 style={{ margin: '4px 0 14px' }}>Monthly Cash Flow</h3>
            <PeriodPills />
            {[
              [incomeLabel, fmt(totalIncomeForPeriod), 'var(--success)', '+'],
              ['Fixed Bills', fmt(totalBillsForPeriod), 'var(--danger)', '-'],
              ['Min Debt Payments', fmt(periodDebt), 'var(--danger)', '-'],
              ['Variable Expenses', fmt(periodSpend), 'var(--warning,#f90)', '-'],
            ].map(([label, val, col, sign]) => (
              <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <span style={{color:col,fontWeight:700,fontSize:'.9rem'}}>{sign}</span>
                  <span style={{fontSize:'.88rem'}}>{label}</span>
                </div>
                <strong style={{color:col}}>{val}</strong>
              </div>
            ))}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 0',marginTop:4}}>
              <strong style={{fontSize:'1rem'}}>= Remaining</strong>
              <strong style={{fontSize:'1.1rem',color: totalIncomeForPeriod - totalBillsForPeriod - periodDebt - periodSpend >= 0 ? 'var(--success)' : 'var(--danger)'}}>
                {fmt(totalIncomeForPeriod - totalBillsForPeriod - periodDebt - periodSpend)}
              </strong>
            </div>
          </section>

          {/* 50/30/20 allocation */}
          <div className="fold-list home-rows">
          <Fold id="budget-allocation" emoji="🧮" title="Spending allocation" sub="Where should your money go? (50/30/20)">
          <section className="card">
            <p className="eyebrow">Spending Allocation</p>
            <h3 style={{ margin: '4px 0 12px' }}>Where Should Your Money Go?</h3>
            <p className="muted" style={{fontSize:'.8rem',marginBottom:14}}>Based on {period === 'monthly' ? `${monthLabel(CUR_MONTH, { month: 'long' })}'s` : `your ${period}`} income of <strong>{fmt(totalIncomeForPeriod)}</strong></p>
            {[
              // Same split as the Overview: bills + debt minimums are needs, tracked spending is wants, the rest is savings
              ['50% — Needs', needs50, totalBillsForPeriod + periodDebt, '#256A2A', 'Fixed bills, utilities, insurance, minimum debt payments'],
              ['30% — Wants', wants30, periodSpend, '#8F5300', 'Dining, shopping, subscriptions, entertainment'],
              ['20% — Savings & Debt', savings20, Math.max(0, totalIncomeForPeriod - totalBillsForPeriod - periodDebt - periodSpend), '#9C27B0', 'What is left to save, invest or pay extra on debt'],
            ].map(([label, target, actual, col, desc], k) => {
              const pct = target > 0 ? Math.min((actual / target) * 100, 200) : 0
              const over = k < 2 && actual > target
              return (
                <div key={label} style={{marginBottom:16,padding:'12px',background:'var(--stone)',borderRadius:10}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                    <strong style={{fontSize:'.85rem',color:col}}>{label}</strong>
                    <span style={{fontSize:'.82rem'}}><strong style={{color:over?'var(--danger)':col}}>{fmt(actual)}</strong> / {fmt(target)}</span>
                  </div>
                  <div style={{height:8,borderRadius:999,background:'var(--border)',marginBottom:6}}>
                    <div style={{height:'100%',borderRadius:999,background:over?'var(--danger)':col,width:`${Math.min(pct,100)}%`,transition:'width .3s'}} />
                  </div>
                  <p className="muted" style={{fontSize:'.72rem',margin:'0 0 2px'}}>{desc}</p>
                  {over && <p style={{fontSize:'.72rem',color:'var(--danger)',margin:0,fontWeight:600}}>⚠ Over target by {fmt(actual-target)}</p>}
                </div>
              )
            })}
          </section>
          </Fold>

          {/* Savings rate */}
          <Fold id="budget-savings-rate" emoji="💰" title="Your savings rate" sub="How much are you keeping?">
          <section className="card">
            <p className="eyebrow">Your Savings Rate</p>
            <h3 style={{ margin: '4px 0 14px' }}>How Much Are You Keeping?</h3>
            {(() => {
              const totalOut = totalBillsForPeriod + periodDebt + periodSpend
              const remaining = totalIncomeForPeriod - totalOut
              const rate = totalIncomeForPeriod > 0 ? (remaining / totalIncomeForPeriod) * 100 : 0
              return (
                <div>
                  <div style={{textAlign:'center',marginBottom:16}}>
                    <div style={{fontSize:'2.5rem',fontWeight:700,color:rate>=20?'var(--success)':rate>=10?'var(--brass-fg)':'var(--danger)'}}>
                      {rate.toFixed(1)}%
                    </div>
                    <p className="muted" style={{fontSize:'.82rem',margin:'4px 0 0'}}>
                      {rate >= 20 ? '🎉 Excellent! Above 20% target' : rate >= 10 ? '👍 Good — aim for 20%+' : '⚠ Below 10% — review your bills and expenses'}
                    </p>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                    {[
                      ['Going Out', fmt(totalOut), 'var(--danger)'],
                      ['Keeping', fmt(Math.max(0,remaining)), 'var(--success)'],
                    ].map(([label, val, col]) => (
                      <div key={label} style={{background:'var(--stone)',borderRadius:10,padding:'12px',textAlign:'center'}}>
                        <p className="muted" style={{fontSize:'.72rem',margin:'0 0 4px'}}>{label}</p>
                        <strong style={{color:col,fontSize:'1.1rem'}}>{val}</strong>
                      </div>
                    ))}
                  </div>
                  <p className="muted" style={{fontSize:'.78rem',marginTop:14,textAlign:'center',lineHeight:1.5}}>
                    Experts recommend saving at least 20% of your income. Even 1% more per month compounded over years creates significant wealth.
                  </p>
                </div>
              )
            })()}
          </section>
          </Fold>
          </div>
        </div>
      )}

      {/* ── NO-SPEND ─────────────────────────────────────────────────────── */}
      {tab === 'nospend' && (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <section className="card">
          <p className="eyebrow">No-Spend Challenge</p>
          <h3 style={{ margin: '4px 0 6px' }}>Color In One Per Day</h3>
          <p className="muted" style={{ fontSize: '.8rem', marginBottom: 14 }}>
            {noSpendFilled} of {noSpend.days} days complete
          </p>
          <div style={{ height: 8, borderRadius: 999, background: 'var(--border)', marginBottom: 16 }}>
            <div style={{ height: '100%', borderRadius: 999, background: 'var(--success)', width: `${(noSpendFilled / noSpend.days) * 100}%` }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, marginBottom: 16 }}>
            {daysArray.map(day => {
              const done = noSpend.checked.includes(day)
              return (
                <button key={day} onClick={() => {
                  const next = done ? noSpend.checked.filter(d => d !== day) : [...noSpend.checked, day]
                  saveNoSpend({ ...noSpend, checked: next })
                }} style={{
                  aspectRatio: '1', borderRadius: '50%', border: '1.5px solid var(--border2)',
                  background: done ? 'var(--success)' : 'var(--stone)',
                  color: done ? 'white' : 'var(--ink2)', cursor: 'pointer',
                  fontWeight: 600, fontSize: '.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>{day}</button>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '.85rem' }}>Challenge length:</span>
            {[7, 14, 21, 30].map(d => (
              <button key={d} className={noSpend.days === d ? 'pill active-pill' : 'pill'}
                style={{ fontSize: '.78rem' }}
                onClick={() => { if (noSpend.days === d) return; if (noSpend.checked.length && !window.confirm(`Start a new ${d}-day challenge? Your ${noSpend.checked.length} colored-in ${noSpend.checked.length === 1 ? 'day' : 'days'} will be cleared.`)) return; saveNoSpend({ days: d, checked: [] }) }}>{d} days</button>
            ))}
          </div>
        </section>
      </ProTabGate>)}
      <TabNav tabs={TABS} activeTab={tab} onSelect={setTab} />
    </div>
  )
}

export { FinancePage }

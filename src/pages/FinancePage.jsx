import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { usePlannerData } from '../context/PlannerContext.jsx'
import { MiniBarChart } from '../components/Charts.jsx'
import { getBudgetSeries } from '../utils/scoring.js'
import { getTodayString } from '../utils/dates.js'

function FinancePage({ expenses, budget, setBudget }) {
  const lsGet = (k, d) => { try { const v = localStorage.getItem('planner.f.' + k); return v ? JSON.parse(v) : d } catch { return d } }
  const lsSet = (k, v) => { try { localStorage.setItem('planner.f.' + k, JSON.stringify(v)) } catch {} }

  const [tab, setTab] = useState('overview')
  const [period, setPeriod] = useState('monthly')

  // ── Shared state (linked across tabs) ─────────────────────────────────
  const [incomes, setIncomes] = useState(() => lsGet('incomes', []))
  const [newIncome, setNewIncome] = useState({ label: '', amount: '', category: 'Primary', period: 'monthly' })
  const saveIncomes = (v) => { setIncomes(v); lsSet('incomes', v) }

  const [bills, setBills] = useState(() => lsGet('bills', []))
  const [newBill, setNewBill] = useState({ label: '', amount: '', category: 'Need' })
  const saveBills = (v) => { setBills(v); lsSet('bills', v) }

  const [debts, setDebts] = useState(() => lsGet('debts', []))
  const [newDebt, setNewDebt] = useState({ name: '', balance: '', rate: '', minPayment: '' })
  const saveDebts = (d) => { setDebts(d); lsSet('debts', d) }

  const [savingsGoals, setSavingsGoals] = useState(() => lsGet('savingsGoals', [
    { id: 1, label: 'Emergency Fund', goal: 1000, current: 0, color: 'var(--teal)' },
  ]))
  const [newSavings, setNewSavings] = useState({ label: '', goal: '', current: '' })
  const [editingSavings, setEditingSavings] = useState({})
  const saveSavingsGoals = (v) => { setSavingsGoals(v); lsSet('savingsGoals', v) }

  const [noSpend, setNoSpend] = useState(() => lsGet('noSpend', { days: 30, checked: [] }))
  const saveNoSpend = (n) => { setNoSpend(n); lsSet('noSpend', n) }

  const [monthlyIncome, setMonthlyIncome] = useState(() => lsGet('monthlyIncome', 0))
  const saveMonthlyIncome = (v) => { setMonthlyIncome(v); lsSet('monthlyIncome', v) }

  // 52-week plan
  const WEEK_PLAN = [150,200,150,250,200,150,200,250,150,200,150,250,200,150,200,250,150,200,150,200,250,150,200,150,200,250,150,200,150,250,200,150,200,250,150,200,150,250,200,150,200,250,150,200,150,200,250,150,200,150,200,250]
  const currentWeekNum = Math.ceil((new Date(TODAY) - new Date(new Date(TODAY).getFullYear(), 0, 1)) / (7 * 24 * 60 * 60 * 1000))
  const [checkedWeeks, setCheckedWeeks] = useState(() => lsGet('weekPlan', []))
  const [challengeGoal, setChallengeGoal] = useState(() => lsGet('challengeGoal', 10000))
  const saveCheckedWeeks = (v) => { setCheckedWeeks(v); lsSet('weekPlan', v) }
  const saveChallengeGoal = (v) => { setChallengeGoal(v); lsSet('challengeGoal', v) }
  const toggleWeek = (w) => saveCheckedWeeks(checkedWeeks.includes(w) ? checkedWeeks.filter(x => x !== w) : [...checkedWeeks, w])
  const totalSavedSoFar = checkedWeeks.reduce((s, w) => s + (WEEK_PLAN[w - 1] || 0), 0)

  // ── Shared computations (linked across all tabs) ───────────────────────
  const PERIOD_MULT = { weekly: 1, monthly: 4.33, quarterly: 13, yearly: 52 }
  const totalWeeklyIncome = incomes.reduce((s, inc) => {
    return s + Number(inc.amount || 0) / (PERIOD_MULT[inc.period] || 4.33)
  }, 0)
  const getIncomeForPeriod = (p) => totalWeeklyIncome * (PERIOD_MULT[p] || 4.33)
  const totalIncomeForPeriod = getIncomeForPeriod(period)

  const fpWeekStart = startOfWeek(TODAY)
  const fpWeekEnd = endOfWeek(TODAY)
  const fpWeekExpenses = (expenses || []).filter(e => e.date >= fpWeekStart && e.date <= fpWeekEnd)
  const fpWeekSpend = fpWeekExpenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0)
  const fpMonthExpenses = (expenses || []).filter(e => e.date && e.date.slice(0, 7) === TODAY.slice(0, 7))
  const fpMonthSpend = fpMonthExpenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0)

  const totalBillsMonthly = bills.reduce((s, b) => s + Number(b.amount || 0), 0)
  const totalBillsForPeriod = totalBillsMonthly * ((PERIOD_MULT[period] || 4.33) / 4.33)
  const totalDebtPayments = debts.reduce((s, d) => s + Number(d.minPayment || 0), 0)
  const totalSavingsStored = savingsGoals.reduce((s, g) => s + Number(g.current || 0), 0)

  // 50/30/20
  const needs50 = totalIncomeForPeriod * 0.5
  const wants30 = totalIncomeForPeriod * 0.3
  const savings20 = totalIncomeForPeriod * 0.2

  const noSpendFilled = noSpend.checked.length
  const daysArray = Array.from({ length: noSpend.days }, (_, i) => i + 1)

  const fmt = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // ── Bank connection state ─────────────────────────────────────────────
  const [connectedBanks, setConnectedBanks] = useState(() => lsGet('connectedBanks', []))
  const [bankTransactions, setBankTransactions] = useState(() => lsGet('bankTransactions', []))
  const [plaidLinkToken, setPlaidLinkToken] = useState(null)
  const [bankLoading, setBankLoading] = useState(false)
  const [bankError, setBankError] = useState('')
  const [autoImport, setAutoImport] = useState(() => lsGet('autoImport', { income: true, expenses: true }))
  const saveBanks = (v) => { setConnectedBanks(v); lsSet('connectedBanks', v) }
  const saveBankTx = (v) => { setBankTransactions(v); lsSet('bankTransactions', v) }
  const saveAutoImport = (v) => { setAutoImport(v); lsSet('autoImport', v) }

  // Simulate bank fetch (real version calls /api/plaid/transactions)
  const fetchBankTransactions = async (bankId) => {
    setBankLoading(true)
    setBankError('')
    try {
      const res = await fetch('/api/plaid/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankId, days: 30 })
      })
      if (!res.ok) throw new Error('Could not fetch transactions')
      const data = await res.json()
      const existing = bankTransactions.filter(t => t.bankId !== bankId)
      saveBankTx([...existing, ...data.transactions])
    } catch(e) {
      setBankError(e.message)
    } finally {
      setBankLoading(false)
    }
  }

  // Categorize transaction as income or expense
  const categorizeTransaction = (tx) => {
    const amount = Number(tx.amount)
    if (amount < 0) return 'income'   // Plaid uses negative for credits
    return 'expense'
  }

  const TABS = [
    { id: 'overview', label: '📊 Overview' },
    { id: 'bank', label: '🏦 Bank Link' },
    { id: 'income', label: '💵 Income' },
    { id: 'expenses', label: '💳 Expenses & Bills' },
    { id: 'savings', label: '💰 Savings' },
    { id: 'debt', label: '📉 Debt' },
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
      <div style={{display:'flex',alignItems:'center',gap:8,paddingBottom:2}}>
        <span style={{fontSize:'1.1rem'}}>💰</span>
        <p style={{fontSize:'.62rem',fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',color:'var(--brass)',margin:0}}>Finance</p>
      </div>
      <div className="pill-row" style={{ overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 4 }}>
        {TABS.map(t => (
          <button key={t.id} className={tab === t.id ? 'pill active-pill' : 'pill'}
            onClick={() => setTab(t.id)} style={{ whiteSpace: 'nowrap', fontSize: '.82rem' }}>{t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <section className="card">
          <p className="eyebrow">Financial Overview</p>
          <h3 style={{ margin: '4px 0 14px' }}>Your Money at a Glance</h3>
          <PeriodPills />
          {[
            ['Total Income', fmt(totalIncomeForPeriod), 'var(--success)'],
            ['Total Bills', fmt(totalBillsForPeriod), 'var(--danger)'],
            ['Expenses (tracked)', fmt(fpWeekSpend * (PERIOD_MULT[period]||4.33)), 'var(--warning,#f90)'],
            ['Debt Min Payments', fmt(totalDebtPayments * ((PERIOD_MULT[period]||4.33)/4.33)), 'var(--danger)'],
            ['Net Available', fmt(totalIncomeForPeriod - totalBillsForPeriod - fpWeekSpend * (PERIOD_MULT[period]||4.33)), totalIncomeForPeriod > totalBillsForPeriod ? 'var(--success)' : 'var(--danger)'],
            ['This Week Spend', fmt(fpWeekSpend), 'var(--brass)'],
            ['This Month Spend', fmt(fpMonthSpend), 'var(--slate)'],
            ['Total Saved (goals)', fmt(totalSavingsStored), 'var(--teal)'],
          ].map(([label, val, col]) => (
            <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 0',borderBottom:'1px solid var(--border)'}}>
              <span style={{fontSize:'.88rem',color:'var(--ink2)'}}>{label}</span>
              <strong style={{color:col}}>{val}</strong>
            </div>
          ))}

          {/* 50/30/20 */}
          <div style={{marginTop:18,background:'var(--stone)',borderRadius:12,padding:'16px'}}>
            <p className="eyebrow" style={{marginBottom:6}}>50 / 30 / 20 Rule</p>
            <p className="muted" style={{fontSize:'.78rem',marginBottom:12}}>Based on your {period} income of {fmt(totalIncomeForPeriod)}</p>
            {[
              ['50% Needs', needs50, '#4CAF50', 'Rent, utilities, groceries, insurance, min debt payments'],
              ['30% Wants', wants30, '#FF9800', 'Dining, shopping, subscriptions, gym, travel'],
              ['20% Savings & Debt', savings20, '#9C27B0', 'Emergency fund, investments, extra debt payments'],
            ].map(([label, amt, col, desc]) => (
              <div key={label} style={{marginBottom:12}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                  <strong style={{fontSize:'.85rem'}}>{label}</strong>
                  <strong style={{color:col,fontSize:'.85rem'}}>{fmt(amt)}</strong>
                </div>
                <div style={{height:8,borderRadius:999,background:'var(--border)',marginBottom:4}}>
                  <div style={{height:'100%',borderRadius:999,background:col,width:'33.3%'}} />
                </div>
                <p className="muted" style={{fontSize:'.72rem',margin:0}}>{desc}</p>
              </div>
            ))}
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
      )}

      {/* ── INCOME ───────────────────────────────────────────────────────── */}
      {tab === 'bank' && (
        <div>
          {/* Security banner */}
          <section className="card" style={{background:'var(--ink)',border:'none'}}>
            <div style={{display:'flex',gap:12,alignItems:'flex-start'}}>
              <div style={{fontSize:'2rem',flexShrink:0}}>🔒</div>
              <div>
                <p className="eyebrow" style={{color:'var(--brass)'}}>Bank-Level Security</p>
                <h3 style={{color:'var(--warm-white)',margin:'4px 0 8px'}}>Your credentials stay private</h3>
                <p style={{color:'rgba(255,255,255,.7)',fontSize:'.82rem',lineHeight:1.6,margin:0}}>
                  We use <strong style={{color:'var(--brass)'}}>Plaid</strong> — the same technology trusted by Venmo, Robinhood, and 7,000+ apps. You log in directly through Plaid's secure interface. We never see your bank username or password. Ever.
                </p>
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginTop:14}}>
              {[
                ['256-bit', 'Encryption'],
                ['SOC 2', 'Certified'],
                ['Read-only', 'Access'],
              ].map(([val,label]) => (
                <div key={label} style={{textAlign:'center',padding:'10px 8px',background:'rgba(255,255,255,.06)',borderRadius:8}}>
                  <div style={{fontWeight:700,color:'var(--brass)',fontSize:'1rem'}}>{val}</div>
                  <div style={{fontSize:'.7rem',color:'rgba(255,255,255,.5)',marginTop:2}}>{label}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Connected accounts */}
          <section className="card">
            <p className="eyebrow">Connected Accounts</p>
            <h3 style={{margin:'4px 0 14px'}}>Your Banks</h3>

            {connectedBanks.length === 0 ? (
              <div style={{textAlign:'center',padding:'24px 0'}}>
                <div style={{fontSize:'3rem',marginBottom:12}}>🏦</div>
                <p style={{fontWeight:600,fontSize:'.9rem',marginBottom:6}}>No banks connected yet</p>
                <p className="muted" style={{fontSize:'.82rem',marginBottom:20,lineHeight:1.5}}>
                  Connect your bank to automatically import income and expenses into your planner.
                </p>
                <button className="primary-btn" style={{fontSize:'.9rem',padding:'12px 24px'}}
                  onClick={async () => {
                    setBankLoading(true)
                    setBankError('')
                    try {
                      // In production: fetch Plaid link token from /api/plaid/link-token
                      // For now show the setup instructions
                      setBankError('SETUP_NEEDED')
                    } catch(e) { setBankError(e.message) } finally { setBankLoading(false) }
                  }}>
                  {bankLoading ? 'Connecting...' : '+ Connect a Bank'}
                </button>

                {bankError === 'SETUP_NEEDED' && (
                  <div style={{marginTop:16,padding:'14px',background:'var(--stone)',borderRadius:10,textAlign:'left'}}>
                    <p style={{fontWeight:600,fontSize:'.85rem',marginBottom:8}}>Setup Required</p>
                    <p className="muted" style={{fontSize:'.8rem',lineHeight:1.6,marginBottom:0}}>
                      To activate bank linking, add your Plaid API keys to Vercel environment variables. See the setup guide below.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div>
                {connectedBanks.map((bank, i) => (
                  <div key={bank.id} style={{padding:'14px',background:'var(--stone)',borderRadius:10,marginBottom:10}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                      <div>
                        <div style={{fontWeight:700,fontSize:'.9rem'}}>{bank.name}</div>
                        <div className="muted" style={{fontSize:'.75rem'}}>••••{bank.last4} · {bank.type}</div>
                      </div>
                      <div style={{display:'flex',gap:8,alignItems:'center'}}>
                        <div style={{width:8,height:8,borderRadius:'50%',background:'var(--success)'}} />
                        <span style={{fontSize:'.75rem',color:'var(--success)'}}>Active</span>
                      </div>
                    </div>
                    <div style={{display:'flex',gap:8}}>
                      <button onClick={() => fetchBankTransactions(bank.id)}
                        style={{flex:1,padding:'8px',borderRadius:8,border:'1.5px solid var(--teal)',
                        background:'none',color:'var(--teal)',cursor:'pointer',fontSize:'.82rem',fontWeight:600}}>
                        {bankLoading ? '⟳ Syncing...' : '↻ Sync Now'}
                      </button>
                      <button onClick={() => saveBanks(connectedBanks.filter((_,j)=>j!==i))}
                        style={{padding:'8px 12px',borderRadius:8,border:'1.5px solid var(--border2)',
                        background:'none',color:'var(--muted)',cursor:'pointer',fontSize:'.82rem'}}>
                        Disconnect
                      </button>
                    </div>
                  </div>
                ))}
                <button className="primary-btn" style={{width:'100%',fontSize:'.85rem',marginTop:4}}>
                  + Add Another Account
                </button>
              </div>
            )}
          </section>

          {/* Auto-import settings */}
          <section className="card">
            <p className="eyebrow">Auto-Import Settings</p>
            <h3 style={{margin:'4px 0 14px'}}>What to Import Automatically</h3>
            {[
              {key:'income', label:'Income & Deposits', desc:'Credits and deposits auto-added to Income tab', icon:'💵'},
              {key:'expenses', label:'Purchases & Payments', desc:'Debits auto-added to Expenses & category breakdown', icon:'💳'},
            ].map(item => (
              <div key={item.key} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 0',borderBottom:'1px solid var(--border)'}}>
                <div style={{display:'flex',gap:10,alignItems:'center'}}>
                  <span style={{fontSize:'1.2rem'}}>{item.icon}</span>
                  <div>
                    <div style={{fontWeight:600,fontSize:'.88rem'}}>{item.label}</div>
                    <div className="muted" style={{fontSize:'.72rem'}}>{item.desc}</div>
                  </div>
                </div>
                <button onClick={() => saveAutoImport({...autoImport,[item.key]:!autoImport[item.key]})}
                  style={{width:44,height:24,borderRadius:999,border:'none',cursor:'pointer',
                  background:autoImport[item.key]?'var(--teal)':'var(--border2)',position:'relative',transition:'background .2s',flexShrink:0}}>
                  <div style={{position:'absolute',top:3,left:autoImport[item.key]?23:3,width:18,height:18,
                    borderRadius:'50%',background:'white',transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}} />
                </button>
              </div>
            ))}
          </section>

          {/* Recent imported transactions */}
          {bankTransactions.length > 0 && (
            <section className="card">
              <p className="eyebrow">Recent Imports</p>
              <h3 style={{margin:'4px 0 14px'}}>Imported Transactions</h3>
              {bankTransactions.slice(0,20).map((tx,i) => {
                const isIncome = Number(tx.amount) < 0
                return (
                  <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
                    <div>
                      <div style={{fontWeight:600,fontSize:'.88rem'}}>{tx.name}</div>
                      <div className="muted" style={{fontSize:'.75rem'}}>{tx.date} · {tx.category?.[0] || 'Uncategorized'}</div>
                    </div>
                    <strong style={{color:isIncome?'var(--success)':'var(--danger)'}}>
                      {isIncome ? '+' : '-'}${Math.abs(tx.amount).toFixed(2)}
                    </strong>
                  </div>
                )
              })}
            </section>
          )}

          {/* Plaid setup guide */}
          <section className="card" style={{background:'var(--stone)'}}>
            <p className="eyebrow">Developer Setup</p>
            <h3 style={{margin:'4px 0 10px',fontSize:'.95rem'}}>Activate Bank Linking</h3>
            <p className="muted" style={{fontSize:'.8rem',marginBottom:12,lineHeight:1.5}}>To enable live bank connections, complete these steps:</p>
            {[
              ['1', 'Create a free account at plaid.com/developers'],
              ['2', 'Get your Client ID and Secret from the Plaid dashboard'],
              ['3', 'Add to Vercel env vars: PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV=sandbox'],
              ['4', 'Deploy the /api/plaid/ serverless functions (provided separately)'],
              ['5', 'Switch from sandbox → production when ready to launch'],
            ].map(([num, step]) => (
              <div key={num} style={{display:'flex',gap:10,marginBottom:8,alignItems:'flex-start'}}>
                <div style={{width:22,height:22,borderRadius:'50%',background:'var(--brass)',color:'var(--ink)',
                  display:'flex',alignItems:'center',justifyContent:'center',fontSize:'.75rem',fontWeight:700,flexShrink:0}}>{num}</div>
                <p style={{fontSize:'.8rem',color:'var(--ink2)',lineHeight:1.5,margin:0}}>{step}</p>
              </div>
            ))}
          </section>
        </div>
      )}

      {tab === 'income' && (
        <section className="card">
          <p className="eyebrow">Income Tracker</p>
          <h3 style={{ margin: '4px 0 14px' }}>Your Income Sources</h3>
          <PeriodPills />
          <div style={{background:'var(--stone)',borderRadius:10,padding:'14px',marginBottom:16,display:'flex',justifyContent:'space-between'}}>
            <div>
              <p className="muted" style={{fontSize:'.75rem',margin:'0 0 2px'}}>Total {period} income</p>
              <strong style={{fontSize:'1.4rem',color:'var(--success)'}}>{fmt(totalIncomeForPeriod)}</strong>
            </div>
            <div style={{textAlign:'right'}}>
              <p className="muted" style={{fontSize:'.75rem',margin:'0 0 2px'}}>Weekly average</p>
              <strong style={{fontSize:'1rem'}}>{fmt(totalWeeklyIncome)}</strong>
            </div>
          </div>
          {incomes.length === 0 && <p className="muted" style={{textAlign:'center',padding:'16px 0'}}>No income sources yet.</p>}
          {incomes.map((inc, i) => (
            <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
              <div>
                <div style={{fontWeight:600,fontSize:'.9rem'}}>{inc.label}</div>
                <div className="muted" style={{fontSize:'.75rem'}}>{inc.category} · {inc.period}</div>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontWeight:700,color:'var(--success)'}}>{fmt(Number(inc.amount||0) / (PERIOD_MULT[inc.period]||4.33) * (PERIOD_MULT[period]||4.33))}</div>
                <div className="muted" style={{fontSize:'.72rem'}}>{fmt(inc.amount)} / {inc.period}</div>
              </div>
              <button onClick={() => saveIncomes(incomes.filter((_,j)=>j!==i))}
                style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:'1.1rem',marginLeft:8}}>✕</button>
            </div>
          ))}
          <div style={{marginTop:16,display:'grid',gap:8}}>
            <p style={{fontWeight:600,fontSize:'.85rem',margin:0}}>Add Income Source</p>
            <input placeholder="Label (e.g. Salary, Freelance)" value={newIncome.label}
              onChange={e=>setNewIncome(p=>({...p,label:e.target.value}))}
              style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}} />
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <input placeholder="Amount ($)" type="number" value={newIncome.amount}
                onChange={e=>setNewIncome(p=>({...p,amount:e.target.value}))}
                style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}} />
              <select value={newIncome.period} onChange={e=>setNewIncome(p=>({...p,period:e.target.value}))}
                style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}}>
                {['weekly','monthly','quarterly','yearly'].map(o=><option key={o} value={o}>{o.charAt(0).toUpperCase()+o.slice(1)}</option>)}
              </select>
            </div>
            <select value={newIncome.category} onChange={e=>setNewIncome(p=>({...p,category:e.target.value}))}
              style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}}>
              {['Primary','Side Hustle','Passive','Investment','Business','Other'].map(c=><option key={c}>{c}</option>)}
            </select>
            <button className="primary-btn" onClick={() => {
              if (!newIncome.label || !newIncome.amount) return
              saveIncomes([...incomes, { ...newIncome, id: Date.now() }])
              setNewIncome({ label: '', amount: '', category: 'Primary', period: 'monthly' })
            }}>+ Add Income</button>
          </div>
        </section>
      )}

      {/* ── EXPENSES & BILLS ─────────────────────────────────────────────── */}
      {tab === 'expenses' && (
        <div>
          {/* Bills section — moved here from Budget */}
          <section className="card">
            <p className="eyebrow">Fixed Bills</p>
            <h3 style={{ margin: '4px 0 10px' }}>Monthly Recurring Expenses</h3>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'2px solid var(--border)',marginBottom:6}}>
              <strong style={{fontSize:'.85rem'}}>Total Monthly Bills</strong>
              <strong style={{color:'var(--danger)',fontSize:'1rem'}}>{fmt(totalBillsMonthly)}</strong>
            </div>
            {bills.length === 0 && <p className="muted" style={{textAlign:'center',padding:'12px 0',fontSize:'.85rem'}}>No bills added yet.</p>}
            {bills.map((b, i) => (
              <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
                <div>
                  <span style={{fontWeight:600,fontSize:'.88rem'}}>{b.label}</span>
                  {b.category && <span className="muted" style={{fontSize:'.72rem',marginLeft:6}}>{b.category}</span>}
                </div>
                <div style={{display:'flex',gap:10,alignItems:'center'}}>
                  <strong style={{color:'var(--danger)'}}>{fmt(b.amount)}</strong>
                  <button onClick={() => saveBills(bills.filter((_,j)=>j!==i))}
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
              <select value={newBill.category} onChange={e=>setNewBill(p=>({...p,category:e.target.value}))}
                style={{padding:'8px 10px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.82rem'}}>
                {['Need','Utility','Insurance','Subscription','Debt Payment','Other'].map(c=><option key={c}>{c}</option>)}
              </select>
              <button className="primary-btn" onClick={() => {
                if (!newBill.label || !newBill.amount) return
                saveBills([...bills, { ...newBill, id: Date.now() }])
                setNewBill({ label: '', amount: '', category: 'Need' })
              }}>+ Add Bill</button>
            </div>
          </section>

          {/* Variable expenses from expense log */}
          <section className="card">
            <p className="eyebrow">Variable Expenses</p>
            <h3 style={{ margin: '4px 0 10px' }}>Tracked Spending</h3>
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
            {(expenses||[]).length === 0 && <p className="muted" style={{textAlign:'center',padding:'12px 0'}}>No expenses logged yet. Add them from Quick Add.</p>}
            {(expenses||[]).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,20).map((exp, i) => (
              <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
                <div>
                  <div style={{fontWeight:600,fontSize:'.88rem'}}>{exp.description || exp.category}</div>
                  <div className="muted" style={{fontSize:'.75rem'}}>{exp.category} · {exp.date}</div>
                </div>
                <strong style={{color:'var(--danger)'}}>{fmt(exp.amount)}</strong>
              </div>
            ))}
            {(expenses||[]).length > 0 && (() => {
              const cats = {}
              expenses.forEach(e => { cats[e.category] = (cats[e.category]||0) + Number(e.amount||0) })
              const total = Object.values(cats).reduce((s,v)=>s+v,0)
              return (
                <div style={{marginTop:16}}>
                  <p style={{fontWeight:600,fontSize:'.85rem',marginBottom:10}}>By Category</p>
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
      )}

      {/* ── SAVINGS ──────────────────────────────────────────────────────── */}
      {tab === 'savings' && (
        <div>
          <section className="card">
            <p className="eyebrow">Savings Challenge</p>
            <h3 style={{ margin: '4px 0 6px' }}>Build Your Savings — Your Way</h3>

            {/* Challenge selector */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:16}}>
              {[
                {goal:1000, label:'$1,000', timeLabel:'30 Days', type:'daily', periods:30, color:'#4CAF50'},
                {goal:3000, label:'$3,000', timeLabel:'3 Months', type:'weekly', periods:13, color:'#2196F3'},
                {goal:5000, label:'$5,000', timeLabel:'6 Months', type:'biweekly', periods:26, color:'#FF9800'},
                {goal:10000, label:'$10,000', timeLabel:'52 Weeks', type:'weekly52', periods:52, color:'#9C27B0'},
              ].map(cfg => {
                const isActive = challengeGoal === cfg.goal
                return (
                  <button key={cfg.goal} onClick={() => { saveChallengeGoal(cfg.goal); saveCheckedWeeks([]) }}
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
                  goal: 1000, label: '$1,000 in 30 Days', color: '#4CAF50', type: 'daily',
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
                  goal: 5000, label: '$5,000 in 6 Months', color: '#FF9800', type: 'biweekly',
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
                        ['Avg/period', '$'+avgNeeded.toFixed(0), 'var(--brass)'],
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
            {savingsGoals.map((sg, i) => {
              const pct = sg.goal > 0 ? Math.min((sg.current / sg.goal) * 100, 100) : 0
              const isEditing = editingSavings[i] !== undefined
              const monthsLeft = sg.goal > sg.current && totalWeeklyIncome > 0
                ? ((sg.goal - sg.current) / (totalWeeklyIncome * 4.33)).toFixed(1)
                : null
              return (
                <div key={sg.id} style={{marginBottom:16,padding:'14px',background:'var(--stone)',borderRadius:12}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                    <strong style={{fontSize:'.9rem'}}>{sg.label}</strong>
                    <button onClick={() => saveSavingsGoals(savingsGoals.filter((_,j)=>j!==i))}
                      style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}}>✕</button>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                    <span className="muted" style={{fontSize:'.8rem'}}>Goal: <strong>{fmt(sg.goal)}</strong></span>
                    <span className="muted" style={{fontSize:'.8rem'}}>{pct.toFixed(0)}% complete</span>
                  </div>
                  <div style={{height:10,borderRadius:999,background:'var(--border)',marginBottom:8}}>
                    <div style={{height:'100%',borderRadius:999,background:sg.color||'var(--brass)',width:`${pct}%`,transition:'width .3s'}} />
                  </div>
                  {monthsLeft && (
                    <p className="muted" style={{fontSize:'.75rem',margin:'0 0 8px'}}>
                      💡 At your current income rate, ~<strong>{monthsLeft} months</strong> to reach this goal if you saved 20%
                    </p>
                  )}
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <span className="muted" style={{fontSize:'.8rem'}}>Saved:</span>
                    {isEditing ? (
                      <>
                        <input type="number" value={editingSavings[i]}
                          onChange={e => setEditingSavings(p=>({...p,[i]:e.target.value}))}
                          style={{flex:1,padding:'5px 8px',border:'1px solid var(--border2)',borderRadius:6,fontSize:'.85rem'}}
                          autoFocus />
                        <button className="primary-btn" style={{padding:'5px 10px',fontSize:'.8rem'}} onClick={() => {
                          const next = savingsGoals.map((g,j) => j===i ? {...g, current: Number(editingSavings[i]||0)} : g)
                          saveSavingsGoals(next)
                          setEditingSavings(p=>{const n={...p};delete n[i];return n})
                        }}>Save</button>
                        <button onClick={()=>setEditingSavings(p=>{const n={...p};delete n[i];return n})}
                          style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:'.85rem'}}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <strong style={{color:sg.color||'var(--brass)',flex:1}}>{fmt(sg.current)}</strong>
                        <button className="ghost-btn" style={{fontSize:'.78rem',padding:'4px 10px'}}
                          onClick={() => setEditingSavings(p=>({...p,[i]:sg.current}))}>Edit</button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
            <div style={{marginTop:8,display:'grid',gap:8}}>
              <p style={{fontWeight:600,fontSize:'.85rem',margin:0}}>New Savings Goal</p>
              <input placeholder="Goal name (e.g. House Down Payment)" value={newSavings.label}
                onChange={e=>setNewSavings(p=>({...p,label:e.target.value}))}
                style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}} />
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                <input type="number" placeholder="Goal amount ($)" value={newSavings.goal}
                  onChange={e=>setNewSavings(p=>({...p,goal:e.target.value}))}
                  style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}} />
                <input type="number" placeholder="Currently saved ($)" value={newSavings.current}
                  onChange={e=>setNewSavings(p=>({...p,current:e.target.value}))}
                  style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem'}} />
              </div>
              <button className="primary-btn" onClick={() => {
                if (!newSavings.label || !newSavings.goal) return
                saveSavingsGoals([...savingsGoals, { id: Date.now(), label: newSavings.label, goal: Number(newSavings.goal), current: Number(newSavings.current||0), color: 'var(--brass)' }])
                setNewSavings({ label: '', goal: '', current: '' })
              }}>+ Add Goal</button>
            </div>
          </section>
        </div>
      )}
      {tab === 'debt' && (
        <section className="card">
          <p className="eyebrow">Debt Tracker</p>
          <h3 style={{ margin: '4px 0 6px' }}>Debt Avalanche — Highest Rate First</h3>
          <p className="muted" style={{fontSize:'.8rem',marginBottom:14}}>Pay minimums on all debts, then throw every extra dollar at the highest interest rate first.</p>
          {debts.length > 0 && (
            <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderBottom:'2px solid var(--border)',marginBottom:6}}>
              <strong>Total Minimum Payments</strong>
              <strong style={{color:'var(--danger)'}}>{fmt(totalDebtPayments)}/mo</strong>
            </div>
          )}
          {debts.length === 0 && <p className="muted" style={{ textAlign: 'center', padding: '20px 0' }}>No debts added yet.</p>}
          {[...debts].sort((a, b) => Number(b.rate || 0) - Number(a.rate || 0)).map((debt, i) => (
            <div key={i} style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <strong style={{ fontSize: '.9rem' }}>{debt.name}</strong>
                <button onClick={() => saveDebts(debts.filter((_,j)=>j!==i))}
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>✕</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: '.8rem' }}>
                <div><p className="muted" style={{margin:'0 0 2px',fontSize:'.7rem'}}>BALANCE</p><strong>${Number(debt.balance).toLocaleString()}</strong></div>
                <div><p className="muted" style={{margin:'0 0 2px',fontSize:'.7rem'}}>RATE</p><strong style={{color:'var(--danger)'}}>{debt.rate}%</strong></div>
                <div><p className="muted" style={{margin:'0 0 2px',fontSize:'.7rem'}}>MIN PMT</p><strong>${debt.minPayment}/mo</strong></div>
              </div>
            </div>
          ))}
          <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
            <p style={{ fontWeight: 600, fontSize: '.85rem', margin: 0 }}>Add a Debt</p>
            <input placeholder="Debt name (e.g. Credit Card, Car Loan)" value={newDebt.name}
              onChange={e => setNewDebt(p => ({ ...p, name: e.target.value }))}
              style={{ padding: '9px 12px', border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', fontSize: '.85rem' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {[['Balance $', 'balance'], ['Rate %', 'rate'], ['Min Pmt $', 'minPayment']].map(([ph, key]) => (
                <input key={key} type="number" placeholder={ph} value={newDebt[key]}
                  onChange={e => setNewDebt(p => ({ ...p, [key]: e.target.value }))}
                  style={{ padding: '9px 12px', border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', fontSize: '.85rem' }} />
              ))}
            </div>
            <button className="primary-btn" onClick={() => {
              if (!newDebt.name) return
              saveDebts([...debts, { ...newDebt, id: Date.now() }])
              setNewDebt({ name: '', balance: '', rate: '', minPayment: '' })
            }}>+ Add Debt</button>
          </div>
        </section>
      )}

      {/* ── BUDGET PLAN ──────────────────────────────────────────────────── */}
      {tab === 'budget' && (
        <div>
          {/* Summary pulled from all tabs */}
          <section className="card">
            <p className="eyebrow">Budget Plan</p>
            <h3 style={{ margin: '4px 0 14px' }}>Monthly Cash Flow</h3>
            <PeriodPills />
            {[
              ['Total Income', fmt(totalIncomeForPeriod), 'var(--success)', '+'],
              ['Fixed Bills', fmt(totalBillsForPeriod), 'var(--danger)', '-'],
              ['Min Debt Payments', fmt(totalDebtPayments * ((PERIOD_MULT[period]||4.33)/4.33)), 'var(--danger)', '-'],
              ['Variable Expenses', fmt(fpWeekSpend * (PERIOD_MULT[period]||4.33)), 'var(--warning,#f90)', '-'],
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
              <strong style={{fontSize:'1.1rem',color: totalIncomeForPeriod - totalBillsForPeriod - totalDebtPayments*((PERIOD_MULT[period]||4.33)/4.33) - fpWeekSpend*(PERIOD_MULT[period]||4.33) >= 0 ? 'var(--success)' : 'var(--danger)'}}>
                {fmt(totalIncomeForPeriod - totalBillsForPeriod - totalDebtPayments*((PERIOD_MULT[period]||4.33)/4.33) - fpWeekSpend*(PERIOD_MULT[period]||4.33))}
              </strong>
            </div>
          </section>

          {/* 50/30/20 allocation */}
          <section className="card">
            <p className="eyebrow">Spending Allocation</p>
            <h3 style={{ margin: '4px 0 12px' }}>Where Should Your Money Go?</h3>
            <p className="muted" style={{fontSize:'.8rem',marginBottom:14}}>Based on your {period} income of <strong>{fmt(totalIncomeForPeriod)}</strong></p>
            {[
              ['50% — Needs', needs50, totalBillsForPeriod, '#4CAF50', 'Fixed bills, utilities, groceries, insurance'],
              ['30% — Wants', wants30, fpWeekSpend*(PERIOD_MULT[period]||4.33), '#FF9800', 'Dining, shopping, subscriptions, entertainment'],
              ['20% — Savings & Debt', savings20, totalDebtPayments*((PERIOD_MULT[period]||4.33)/4.33), '#9C27B0', 'Emergency fund, investments, extra debt payments'],
            ].map(([label, target, actual, col, desc]) => {
              const pct = target > 0 ? Math.min((actual / target) * 100, 200) : 0
              const over = actual > target
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

          {/* Savings rate */}
          <section className="card">
            <p className="eyebrow">Your Savings Rate</p>
            <h3 style={{ margin: '4px 0 14px' }}>How Much Are You Keeping?</h3>
            {(() => {
              const totalOut = totalBillsForPeriod + fpWeekSpend*(PERIOD_MULT[period]||4.33)
              const remaining = totalIncomeForPeriod - totalOut
              const rate = totalIncomeForPeriod > 0 ? (remaining / totalIncomeForPeriod) * 100 : 0
              return (
                <div>
                  <div style={{textAlign:'center',marginBottom:16}}>
                    <div style={{fontSize:'2.5rem',fontWeight:700,color:rate>=20?'var(--success)':rate>=10?'var(--brass)':'var(--danger)'}}>
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
        </div>
      )}

      {/* ── NO-SPEND ─────────────────────────────────────────────────────── */}
      {tab === 'nospend' && (
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
                onClick={() => saveNoSpend({ days: d, checked: [] })}>{d} days</button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}




// ── WELLNESS PAGE ─────────────────────────────────────────────────────────

export default FinancePage

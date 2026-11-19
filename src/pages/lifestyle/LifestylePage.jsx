// Lifestyle page: groceries, recipes, trips, birthdays, gifts, cleaning.
import React, { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { hasSupabaseEnv, supabase } from '../../lib/supabase.js'
import { TODAY, formatDateLabel } from '../../lib/dates.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { useUrlTab } from '../../shell/nav.js'
import { PRO_TABS, ProTabGate } from '../../components/Pro.jsx'
import { EmptyState } from '../../components/EmptyState.jsx'
import { stripEmoji, emojiOf, PageHeader } from '../../components/PageHeader.jsx'
import { makeSections, SectionRows, usePrimary } from '../../components/Sections.jsx'
import { useOwnWrites, useRemotePageData } from '../../lib/pageData.js'
import { CleaningTracker } from './CleaningTracker.jsx'
import { groceryKey, RecipeBook } from './Recipes.jsx'

// One line under each row's name on this page (components/Sections.jsx)
const SECTION_SUBS = {
  groceries: 'Your list, aisle by aisle',
  recipes: 'Saved meals and ingredients',
  trips: 'Plans and packing',
  birthdays: 'Dates to remember',
  gifts: 'Ideas and budgets',
  cleaning: 'Rooms and routines',
}

function LifestylePage({ isPro = false, onUpgrade = () => {}, onToast }) {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const fmt = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // Device copy uses the same 'planner.l.' keys the page reads on open (was writing bare keys).
  const ownPage = useOwnWrites()
  const syncPageData = React.useCallback(async (key, value) => {
    try { localStorage.setItem('planner.l.' + key, JSON.stringify(value)) } catch {}
    const at = ownPage.mark(key)
    if (!user || !hasSupabaseEnv) return
    try {
      await supabase.from('page_data').upsert({
        user_id: user.id, page: 'lifestyle', data_key: key, data_value: value,
        updated_at: at
      }, { onConflict: 'user_id,page,data_key' })
    } catch (e) { console.error('Lifestyle sync error:', e) }
  }, [user?.id, ownPage])

  React.useEffect(() => {
    if (!user || !hasSupabaseEnv) return
    supabase.from('page_data')
      .select('data_key, data_value')
      .eq('user_id', user.id).eq('page', 'lifestyle')
      .then(({ data, error }) => {
        if (error || !data) return
        data.forEach(row => {
          if (ownPage.wrote(row.data_key)) return
          applyLifestyle(row.data_key, row.data_value)
        })
      })
  }, [user?.id])
  const applyLifestyle = (key, v) => {
    const set = { trips: setTrips, birthdays: setBirthdays, groceries: setGroceries, recipes: setRecipes, gifts: setGifts }[key]
    if (!set) return false
    set(v || [])
    lsSet(key, v || [])
    return true
  }
  useRemotePageData('lifestyle', ownPage, (key, value) => { applyLifestyle(key, value) })

  // Reads the 'planner.l.' copy, falling back to the bare key older builds wrote
  const lsGet = (k, d) => { try { const v = localStorage.getItem('planner.l.' + k) ?? localStorage.getItem(k); return v ? JSON.parse(v) : d } catch { return d } }
  const lsSet = (k, v) => { try { localStorage.setItem('planner.l.' + k, JSON.stringify(v)) } catch {} }

  // Cleaning stays open with Pro (Groceries without, since Cleaning is Pro); the rest are rows (components/Sections.jsx)
  const primary = isPro ? 'cleaning' : 'groceries'
  const [tab, setTab] = useUrlTab(primary)
  const pick = usePrimary(tab, setTab, primary)
  const S = makeSections()
  const [trips, setTrips] = useState(() => lsGet('trips', []))
  const [newTrip, setNewTrip] = useState({ destination: '', startDate: '', endDate: '', notes: '', packing: '' })
  const [birthdays, setBirthdays] = useState(() => lsGet('birthdays', []))
  const [newBirthday, setNewBirthday] = useState({ name: '', date: '', relationship: '', notes: '' })
  const saveTrips = (t) => { setTrips(t); syncPageData('trips', t) }
  const saveBirthdays = (b) => { setBirthdays(b); syncPageData('birthdays', b) }
  const [recipes, setRecipes] = useState(() => lsGet('recipes', []))
  const saveRecipes = (r) => { setRecipes(r); syncPageData('recipes', r) }
  const openRecipeId = new URLSearchParams(location.search).get('recipe')
  const [gifts, setGifts] = useState(() => lsGet('gifts', []))
  const saveGifts = (g) => { setGifts(g); syncPageData('gifts', g) }
  const [newGift, setNewGift] = useState({recipient:'',occasion:'Birthday',idea:'',amount:'',purchased:false,year:new Date().getFullYear()+''})
  const [groceries, setGroceries] = useState(() => lsGet('groceries', []))
  const [form, setForm] = useState({})
  const save = (key, setter, val) => { setter(val); syncPageData(key, val) }
  // Recipe → shopping list. Skips anything already unchecked on the list; re-opens checked-off matches.
  const addToGroceries = (items, from) => {
    const list = [...groceries]
    let added = 0
    for (const it of items) {
      const k = groceryKey(it.label)
      const i = list.findIndex((g) => groceryKey(g.label) === k)
      if (i >= 0) {
        if (list[i].done) { list[i] = { ...list[i], done: false, qty: it.qty || list[i].qty, from }; added++ }
        continue
      }
      list.push({ label: it.label, qty: it.qty, done: false, from }); added++
    }
    if (added) save('groceries', setGroceries, list)
    return added
  }

  const TABS = [
    { id: 'groceries', label: '🛒 Groceries' },
    { id: 'recipes', label: '🍳 Recipes' },
    { id: 'trips', label: '✈ Trips' },
    { id: 'birthdays', label: '🎂 Birthdays' },
    { id: 'gifts', label: '🎁 Gifts' },
    { id: 'cleaning', label: '🧹 Cleaning' },
  ]

  const SimpleList = ({ items, onDelete, renderItem }) => items.length === 0
    ? <p className="muted" style={{ fontSize: '.85rem' }}>Nothing added yet.</p>
    : items.map((item, i) => (
      <div key={i} className="metric-row card-row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>{renderItem(item)}</div>
        <button onClick={() => onDelete(i)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', flexShrink: 0 }}>✕</button>
      </div>
    ))

  return (
    <div className="screen-stack">
      <PageHeader icon={Compass} title="Lifestyle" subtitle="Home, table, and the people you love" />


      {S.add('groceries', () => (
        <div>
          {/* Custom list */}
          <section className="card">
            <p className="eyebrow">My List</p>
            <h3 style={{ margin: '4px 0 12px' }}>Shopping List</h3>
            {/* Still-to-buy first, checked-off items sink to the bottom */}
            {groceries.map((item, i) => ({ item, i })).sort((a, b) => Number(!!a.item.done) - Number(!!b.item.done)).map(({ item, i }) => (
              <div key={i + ':' + item.label} onClick={() => save('groceries', setGroceries, groceries.map((g, j) => j === i ? { ...g, done: !g.done } : g))}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                <div style={{ width: 22, height: 22, borderRadius: 6, border: '2px solid', borderColor: item.done ? 'var(--navy)' : 'var(--border2)', background: item.done ? 'var(--navy)' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {item.done && <span style={{ color: 'white', fontWeight: 700, fontSize: '.8rem' }}>✓</span>}
                </div>
                <span style={{ flex: 1, minWidth: 0, color: item.done ? 'var(--muted)' : 'var(--ink)', fontSize: '.9rem' }}>
                  <span style={{ textDecoration: item.done ? 'line-through' : 'none' }}>{item.label}</span>
                  {item.from && <span className="grocery-from">for {item.from}</span>}
                </span>
                {item.qty && <span style={{ fontSize: '.78rem', color: 'var(--teal)' }}>{item.qty}</span>}
                <button onClick={e => { e.stopPropagation(); save('groceries', setGroceries, groceries.filter((_, j) => j !== i)) }}
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>✕</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <input placeholder="Item" value={form.grocLabel || ''} onChange={e => setForm(p => ({ ...p, grocLabel: e.target.value }))}
                style={{ flex: 2, padding: '9px 10px', border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', fontSize: '.85rem' }} />
              <input placeholder="Qty" value={form.grocQty || ''} onChange={e => setForm(p => ({ ...p, grocQty: e.target.value }))}
                style={{ flex: 1, padding: '9px 10px', border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', fontSize: '.85rem' }} />
              <button className="primary-btn" style={{ padding: '9px 14px', fontSize: '.82rem' }}
                onClick={() => { const label = String(form.grocLabel || '').trim(); if (!label) return; addToGroceries([{ label, qty: form.grocQty || '' }]) || onToast?.('Already on your list', label); setForm(p => ({ ...p, grocLabel: '', grocQty: '' })) }}>+</button>
            </div>
            {groceries.some(g => g.done) && (
              <button className="ghost-btn" style={{ marginTop: 10, fontSize: '.82rem' }}
                onClick={() => save('groceries', setGroceries, groceries.filter(g => !g.done))}>Clear Checked</button>
            )}
          </section>

          {/* Master grocery list */}
          <section className="card">
            <p className="eyebrow">Master Grocery List</p>
            <h3 style={{ margin: '4px 0 6px' }}>Tap to add to your list</h3>
            <p className="muted" style={{fontSize:'.8rem',marginBottom:10}}>Open an aisle, then tap any item to add it to your shopping list above.</p>
            {[
              { cat:'🍎 Fruits', color:'#fde8e8', items:['Apples','Apricots','Avocados','Bananas','Berries','Cherries','Grapefruit','Grapes','Kiwi','Lemons','Limes','Melons','Nectarines','Oranges','Papaya','Peaches','Pears','Plums','Pomegranate','Watermelon'] },
              { cat:'🥦 Vegetables', color:'#d5f5e3', items:['Artichokes','Asparagus','Basil','Beets','Broccoli','Cabbage','Cauliflower','Carrots','Celery','Chiles','Chives','Cilantro','Corn','Cucumbers','Eggplant','Garlic Cloves','Green Onions','Lettuce','Onions','Peppers','Potatoes','Salad Greens','Spinach','Sprouts','Squash','Tomatoes','Zucchini'] },
              { cat:'🥩 Meat', color:'#fde8e8', items:['Bacon','Chicken','Deli Meat','Ground Beef','Ground Turkey','Ham','Hot Dogs','Pork','Sausage','Steak','Turkey'] },
              { cat:'🐟 Seafood', color:'#d5eaf5', items:['Catfish','Cod','Crab','Halibut','Lobster','Oysters','Salmon','Shrimp','Tilapia','Tuna'] },
              { cat:'❄ Frozen', color:'#e8d5f5', items:['Chicken Bites','Desserts','Fish Sticks','Frozen Fruit','Ice','Ice Cream','Ice Pops','Frozen Juice','Frozen Meat','Pie Shells','Pizza','Pot Pies','Frozen Potatoes','TV Dinners','Frozen Vegetables','Veggie Burger','Waffles'] },
              { cat:'🥛 Refrigerated', color:'#fff8e1', items:['Biscuits','Butter','Cheddar Cheese','Cream','Cream Cheese','Dip','Eggs','Egg Substitute','Feta Cheese','Half & Half','Jack Cheese','Milk','Mozzarella','Processed Cheese','Salsa','Shredded Cheese','Sour Cream','Swiss Cheese','Whipped Cheese','Yogurt'] },
              { cat:'🍞 Bakery', color:'#fde8e8', items:['Bagels','Bread','Donuts','Cake','Cookies','Croutons','Dinner Rolls','Hamburger Buns','Hot Dog Buns','Muffins','Pastries','Pie','Pita Bread','Tortillas (Corn)','Tortillas (Flour)'] },
              { cat:'🥫 Cans & Jars', color:'#e8f5e9', items:['Applesauce','Baked Beans','Black Beans','Broth','Bullion Cubes','Canned Fruit','Canned Vegetables','Carrots','Chili','Corn','Creamed Corn','Jam/Jelly','Mushrooms','Olives (Green)','Olives (Black)','Pasta','Pasta Sauce','Peanut Butter','Pickles','Pie Filling','Soup'] },
              { cat:'🍝 Pasta & Rice', color:'#fff3cd', items:['Brown Rice','Burger Helper','Couscous','Elbow Macaroni','Lasagna','Mac & Cheese','Noodle Mix','Rice Mix','Spaghetti','White Rice'] },
              { cat:'🧁 Baking', color:'#fce4ec', items:['Baking Powder','Baking Soda','Bread Crumbs','Cake Decor','Cake Mix','Canned Milk','Chocolate Chips','Cocoa','Cornmeal','Cornstarch','Flour','Food Coloring','Frosting','Muffin Mix','Pie Crust','Shortening','Brown Sugar','Powdered Sugar','Sugar','Yeast'] },
              { cat:'🍿 Snacks', color:'#e8f4f8', items:['Candy','Cookies','Crackers','Dried Fruit','Fruit Snacks','Gelatin','Graham Crackers','Granola Bars','Gum','Nuts','Popcorn','Potato Chips','Pretzels','Pudding','Raisins','Seeds','Tortilla Chips'] },
              { cat:'🥣 Breakfast', color:'#fff8e1', items:['Cereal','Grits','Instant Breakfast Drink','Oatmeal','Pancake Mix'] },
              { cat:'🧂 Seasoning', color:'#f3e5f5', items:['Basil','Bay Leaves','BBQ Seasoning','Cinnamon','Cloves','Cumin','Curry','Dill','Garlic Powder','Garlic Salt','Gravy Mix','Italian Seasoning','Marinade','Meat Tenderizer','Oregano','Paprika','Pepper','Poppy Seed','Red Pepper','Sage','Salt','Seasoned Salt','Soup Mix','Vanilla Extract'] },
              { cat:'🫙 Sauces & Condiments', color:'#e8f5e9', items:['BBQ Sauce','Catsup','Cocktail Sauce','Cooking Spray','Honey','Horseradish','Hot Sauce','Lemon Juice','Mayonnaise','Mustard','Olive Oil','Relish','Salad Dressing','Salsa','Soy Sauce','Steak Sauce','Sweet & Sour','Teriyaki','Vegetable Oil','Vinegar'] },
              { cat:'🥤 Drinks', color:'#e3f2fd', items:['Beer','Champagne','Club Soda','Coffee','Diet Soft Drinks','Energy Drinks','Juice','Liquor','Soft Drinks','Tea','Wine'] },
              { cat:'🧻 Paper Products', color:'#fff3e0', items:['Aluminum Foil','Coffee Filters','Cups','Garbage Bags','Napkins','Paper Plates','Paper Towels','Plastic Bags','Plastic Cutlery','Plastic Wrap','Straws','Waxed Paper'] },
              { cat:'🧹 Cleaning', color:'#e8f5e9', items:['Air Freshener','Bleach','Dish Soap','Dishwasher Detergent','Fabric Softener','Floor Cleaner','Glass Spray','Laundry Soap','Polish','Sponges','Vacuum Bags'] },
              { cat:'🧴 Personal Care', color:'#fce4ec', items:['Bath Soap','Bug Repellant','Conditioner','Cotton Swabs','Dental Floss','Deodorant','Facial Tissue','Family Planning','Feminine Products','Hair Spray','Hand Soap','Lip Care','Lotion','Makeup','Mouthwash','Razors/Blades','Shampoo','Shaving Cream','Sunscreen','Toilet Tissue','Toothbrush','Toothpaste'] },
              { cat:'👶 Baby', color:'#e8d5f5', items:['Baby Cereal','Baby Food','Diapers','Diaper Cream','Formula','Wipes'] },
              { cat:'🐾 Pets', color:'#fff8e1', items:['Cat Food','Cat Sand','Dog Food','Pet Shampoo','Treats','Flea Treatment'] },
              { cat:'⚡ Misc Items', color:'#f5f5f5', items:['Batteries','Charcoal','Greeting Cards','Light Bulbs'] },
            ].map(({ cat, color, items }) => (
              <details key={cat} className="grocery-cat">
                <summary style={{display:'flex',alignItems:'center',gap:10}}>
                  <span style={{fontSize:'.64rem',fontWeight:700,letterSpacing:'.14em',textTransform:'uppercase',color:'var(--brass-fg)'}}><span aria-hidden="true" style={{fontSize:'.95rem',letterSpacing:0,marginRight:6}}>{emojiOf(cat)}</span>{stripEmoji(cat)}</span>
                  <span style={{flex:1,height:1,background:'var(--border2)'}} />
                  <span className="grocery-cat-count">{items.filter((item) => groceries.some((g) => groceryKey(g.label) === groceryKey(item) && !g.done)).length > 0 ? `${items.filter((item) => groceries.some((g) => groceryKey(g.label) === groceryKey(item) && !g.done)).length} on list · ` : ''}{items.length}</span>
                  <span aria-hidden="true" className="fold-caret">▾</span>
                </summary>
                <div style={{display:'flex',flexWrap:'wrap',gap:6,padding:'10px 0 6px'}}>
                  {items.map(item => {
                    // Checked-off items can be added again (they used to stay locked until "Clear Checked")
                    const alreadyAdded = groceries.some(g => groceryKey(g.label) === groceryKey(item) && !g.done)
                    return (
                      <button key={item} onClick={() => {
                        if (alreadyAdded) return
                        addToGroceries([{ label: item, qty: '' }])
                      }} style={{
                        padding:'5px 10px', borderRadius:999, fontSize:'.78rem', cursor: alreadyAdded ? 'default' : 'pointer',
                        border: alreadyAdded ? '1.5px solid var(--success)' : '1.5px solid var(--border2)',
                        background: alreadyAdded ? 'var(--success)' : 'var(--stone)',
                        color: alreadyAdded ? 'white' : 'var(--ink2)',
                        fontWeight: 500
                      }}>
                        {alreadyAdded ? '✓ ' : '+ '}{item}
                      </button>
                    )
                  })}
                </div>
              </details>
            ))}
          </section>
        </div>
      ))}

      {S.add('recipes', () => (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
          <RecipeBook recipes={recipes} onSave={saveRecipes} groceries={groceries}
            onAddToList={addToGroceries} onViewList={() => pick('groceries')}
            openId={openRecipeId} onOpened={() => navigate('/lifestyle?tab=recipes', { replace: true })}
            onToast={onToast} />
        </ProTabGate>
      ))}

      {S.add('cleaning', () => (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
          <CleaningTracker />
        </ProTabGate>
      ))}

      {S.add('gifts', () => (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <section className="card">
          <p className="eyebrow">Gift Tracker</p>
          <h3 style={{margin:'4px 0 8px'}}>Gifts & Ideas</h3>
          <p className="muted" style={{fontSize:'.8rem',marginBottom:14}}>
            Remember what you gave, plan what's next. Never repeat a gift.
          </p>

          {/* Summary */}
          {(() => {
            const thisYear = new Date().getFullYear()
            const yearGifts = gifts.filter(g => g.year == thisYear)
            const purchased = yearGifts.filter(g => g.purchased).length
            const totalSpent = yearGifts.filter(g => g.purchased).reduce((s,g) => s + Number(g.amount||0), 0)
            return (
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:14}}>
                <div style={{background:'var(--stone)',borderRadius:10,padding:'10px 4px',textAlign:'center'}}>
                  <div className="muted" style={{fontSize:'.65rem',fontWeight:600,letterSpacing:'.05em',textTransform:'uppercase',marginBottom:2}}>Ideas</div>
                  <strong style={{color:'var(--teal)',fontSize:'1rem'}}>{yearGifts.length}</strong>
                </div>
                <div style={{background:'var(--stone)',borderRadius:10,padding:'10px 4px',textAlign:'center'}}>
                  <div className="muted" style={{fontSize:'.65rem',fontWeight:600,letterSpacing:'.05em',textTransform:'uppercase',marginBottom:2}}>Bought</div>
                  <strong style={{color:'var(--success)',fontSize:'1rem'}}>{purchased}</strong>
                </div>
                <div style={{background:'var(--stone)',borderRadius:10,padding:'10px 4px',textAlign:'center'}}>
                  <div className="muted" style={{fontSize:'.65rem',fontWeight:600,letterSpacing:'.05em',textTransform:'uppercase',marginBottom:2}}>Spent</div>
                  <strong style={{color:'var(--brass-fg)',fontSize:'1rem'}}>{fmt(totalSpent)}</strong>
                </div>
              </div>
            )
          })()}

          {/* Add */}
          <div style={{background:'var(--stone)',borderRadius:12,padding:14,marginBottom:14,display:'grid',gap:8}}>
            <input placeholder="Recipient" value={newGift.recipient}
              onChange={e => setNewGift(p => ({...p, recipient: e.target.value}))}
              style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:8,fontSize:'.88rem'}} />
            <input placeholder="Gift idea" value={newGift.idea}
              onChange={e => setNewGift(p => ({...p, idea: e.target.value}))}
              style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:8,fontSize:'.88rem'}} />
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
              <select value={newGift.occasion} onChange={e => setNewGift(p => ({...p, occasion: e.target.value}))}
                style={{padding:'9px 8px',border:'1.5px solid var(--border2)',borderRadius:8,fontSize:'.82rem'}}>
                {['Birthday','Christmas','Easter','Anniversary','Wedding','Baby','Just Because','Other'].map(o => <option key={o}>{o}</option>)}
              </select>
              <input type="number" placeholder="Budget" value={newGift.amount}
                onChange={e => setNewGift(p => ({...p, amount: e.target.value}))}
                style={{padding:'9px 8px',border:'1.5px solid var(--border2)',borderRadius:8,fontSize:'.82rem'}} />
              <input type="number" placeholder="Year" value={newGift.year}
                onChange={e => setNewGift(p => ({...p, year: e.target.value}))}
                style={{padding:'9px 8px',border:'1.5px solid var(--border2)',borderRadius:8,fontSize:'.82rem'}} />
            </div>
            <button onClick={() => {
              if(!newGift.recipient || !newGift.idea) return
              saveGifts([...gifts, {...newGift, id: Date.now()}])
              setNewGift({recipient:'',occasion:'Birthday',idea:'',amount:'',purchased:false,year:new Date().getFullYear()+''})
            }} style={{padding:'10px',background:'var(--brass-text)',color:'white',border:'none',borderRadius:8,fontWeight:600,cursor:'pointer'}}>
              + Add Gift
            </button>
          </div>

          {/* List */}
          {gifts.length === 0 ? (
            <EmptyState icon="🎁" title="No gifts tracked yet" message="Add ideas as they come. Mark purchased when bought. Never repeat a gift." />
          ) : (
            <div>
              {gifts.slice().reverse().map(g => (
                <div key={g.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid var(--border)',gap:8}}>
                  <button onClick={() => saveGifts(gifts.map(x => x.id === g.id ? {...x, purchased: !x.purchased} : x))} style={{
                    width:22,height:22,borderRadius:6,flexShrink:0,cursor:'pointer',padding:0,
                    background: g.purchased ? 'var(--success)' : 'transparent',
                    border: '2px solid ' + (g.purchased ? 'var(--success)' : 'var(--border2)'),
                    color:'white',fontSize:'.85rem',
                  }}>{g.purchased && '✓'}</button>
                  <div style={{flex:1,minWidth:0,textDecoration: g.purchased ? 'line-through' : 'none',opacity: g.purchased ? .6 : 1}}>
                    <div style={{fontWeight:600,fontSize:'.88rem'}}>{g.recipient} — {g.idea}</div>
                    <div className="muted" style={{fontSize:'.74rem'}}>
                      <span style={{color:'var(--brass-fg)',fontWeight:600}}>{g.occasion}</span> · {g.year}
                      {g.amount && <> · {fmt(g.amount)}</>}
                    </div>
                  </div>
                  <button onClick={() => {
                    if(window.confirm(`Delete gift for ${g.recipient}?`)) saveGifts(gifts.filter(x => x.id !== g.id))
                  }} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',padding:'4px 8px'}}>✕</button>
                </div>
              ))}
            </div>
          )}
        </section>
        </ProTabGate>
      ))}

      {S.add('trips', () => (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <div>
          <section className="card">
            <p className="eyebrow">Trip Planner</p>
            <h3 style={{margin:'4px 0 12px'}}>Upcoming & Past Trips</h3>
            {trips.length === 0 && <p className="muted" style={{fontSize:'.85rem',marginBottom:12}}><EmptyState icon="✈️" title="The world is waiting" message="Add a trip you're looking forward to." /></p>}
            {/* Upcoming trips first (soonest on top), then past ones (most recent first) */}
            {[...trips].sort((a, b) => {
              const pa = (a.endDate || a.startDate || '9999') < TODAY, pb = (b.endDate || b.startDate || '9999') < TODAY
              if (pa !== pb) return pa ? 1 : -1
              return pa ? String(b.startDate || '').localeCompare(String(a.startDate || '')) : String(a.startDate || '9999').localeCompare(String(b.startDate || '9999'))
            }).map((trip, i) => {
              const past = (trip.endDate || trip.startDate || '9999') < TODAY
              const away = trip.startDate && trip.startDate > TODAY ? Math.round((Date.parse(trip.startDate + 'T12:00:00Z') - Date.parse(TODAY + 'T12:00:00Z')) / 86400000) : null
              const fmtD = (d) => d ? formatDateLabel(d, { month: 'short', day: 'numeric', year: d.slice(0, 4) !== TODAY.slice(0, 4) ? 'numeric' : undefined }) : ''
              return (
              <div key={trip.id || i} style={{padding:'12px 0',borderBottom:'1px solid var(--stone2)',opacity: past ? .7 : 1}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:4}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:'1rem',color:'var(--ink)'}}>{trip.destination}</div>
                    <div style={{fontSize:'.75rem',color:'var(--muted)'}}>{fmtD(trip.startDate)}{trip.endDate ? ' → ' + fmtD(trip.endDate) : ''}{past ? ' · Past' : away != null ? ` · in ${away} day${away === 1 ? '' : 's'}` : trip.startDate ? ' · Now' : ''}</div>
                  </div>
                  <button aria-label="Delete trip" onClick={()=>{ if (window.confirm(`Delete the trip to ${trip.destination || 'this place'}?`)) saveTrips(trips.filter((x)=>x!==trip)) }} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}}>✕</button>
                </div>
                {trip.notes && <div style={{fontSize:'.82rem',color:'var(--ink2)',marginBottom:6,lineHeight:1.5}}>{trip.notes}</div>}
                {trip.packing && (
                  <div style={{marginTop:6}}>
                    <div style={{fontSize:'.68rem',fontWeight:700,color:'var(--brass-fg)',letterSpacing:'.08em',marginBottom:4}}>PACKING LIST</div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                      {trip.packing.split(',').map((item,j) => (
                        <span key={j} style={{fontSize:'.72rem',padding:'2px 8px',borderRadius:999,background:'var(--brass-dim)',color:'var(--brass-fg)',fontWeight:500}}>{item.trim()}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              )
            })}
            <div style={{display:'grid',gap:8,marginTop:12}}>
              <input placeholder="Destination" value={newTrip.destination} onChange={e=>setNewTrip(p=>({...p,destination:e.target.value}))}
                style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.88rem',background:'var(--stone)',color:'var(--text)'}} />
              <div style={{display:'flex',gap:8}}>
                <input type="date" placeholder="Start" value={newTrip.startDate} onChange={e=>setNewTrip(p=>({...p,startDate:e.target.value}))}
                  style={{flex:1,padding:'9px 8px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.82rem',background:'var(--stone)',color:'var(--text)'}} />
                <input type="date" placeholder="End" value={newTrip.endDate} onChange={e=>setNewTrip(p=>({...p,endDate:e.target.value}))}
                  style={{flex:1,padding:'9px 8px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.82rem',background:'var(--stone)',color:'var(--text)'}} />
              </div>
              <input placeholder="Notes (hotel, plan, ideas...)" value={newTrip.notes} onChange={e=>setNewTrip(p=>({...p,notes:e.target.value}))}
                style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem',background:'var(--stone)',color:'var(--text)'}} />
              <input placeholder="Packing list (comma separated)" value={newTrip.packing} onChange={e=>setNewTrip(p=>({...p,packing:e.target.value}))}
                style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem',background:'var(--stone)',color:'var(--text)'}} />
              <button className="primary-btn" onClick={()=>{if(!newTrip.destination)return;saveTrips([...trips,{...newTrip,id:Date.now()}]);setNewTrip({destination:'',startDate:'',endDate:'',notes:'',packing:''})}}>Add Trip</button>
            </div>
          </section>
        </div>
      </ProTabGate>))}

      {S.add('birthdays', () => (
        <ProTabGate isPro={isPro} onUpgrade={onUpgrade}>
        <div>
          <section className="card">
            <p className="eyebrow">Birthday Reminders</p>
            <h3 style={{margin:'4px 0 12px'}}>Never miss one</h3>
            {birthdays.length === 0 && <p className="muted" style={{fontSize:'.85rem',marginBottom:12}}><EmptyState icon="🎂" title="No birthdays yet" message="Add the people you want to celebrate." /></p>}
            {(() => {
              // Days until the next birthday, counted on plain dates (a birthday today used to show as 365d)
              const untilNext = (dateStr) => {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '')) return null
                const [, m, d] = dateStr.split('-').map(Number)
                const y = Number(TODAY.slice(0, 4))
                const on = (yy) => { const last = new Date(Date.UTC(yy, m, 0)).getUTCDate(); return `${yy}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}` }
                const next = on(y) >= TODAY ? on(y) : on(y + 1)
                return { days: Math.round((Date.parse(next + 'T12:00:00Z') - Date.parse(TODAY + 'T12:00:00Z')) / 86400000), turns: Number(next.slice(0, 4)) - Number(dateStr.slice(0, 4)) }
              }
              return [...birthdays].map((bd) => ({ bd, next: untilNext(bd.date) })).sort((a, b) => (a.next?.days ?? 999) - (b.next?.days ?? 999))
            })().map(({ bd, next }, i) => {
              const daysUntil = next ? next.days : null
              return (
                <div key={i} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:'1px solid var(--stone2)'}}>
                  <div style={{width:44,height:44,borderRadius:'50%',background:'var(--brass-dim)',display:'grid',placeItems:'center',flexShrink:0}}>
                    <span style={{fontSize:'1.2rem'}}>🎂</span>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:'.9rem',color:'var(--ink)'}}>{bd.name}</div>
                    <div style={{fontSize:'.75rem',color:'var(--muted)'}}>{[bd.relationship, bd.date ? formatDateLabel(bd.date, { month: 'long', day: 'numeric' }) : '', next && next.turns > 0 && next.turns < 130 ? `turns ${next.turns}` : ''].filter(Boolean).join(' · ')}</div>
                    {bd.notes && <div style={{fontSize:'.75rem',color:'var(--muted)',fontStyle:'italic'}}>{bd.notes}</div>}
                  </div>
                  <div style={{textAlign:'center',flexShrink:0}}>
                    {daysUntil !== null && (
                      <div style={{fontWeight:700,fontSize:'.85rem',color:daysUntil<=7?'var(--danger)':daysUntil<=30?'var(--warning)':'var(--teal)'}}>
                        {daysUntil === 0 ? '🎉 Today!' : `${daysUntil}d`}
                      </div>
                    )}
                    <button aria-label={`Remove ${bd.name}`} onClick={()=>{ if (window.confirm(`Remove ${bd.name}'s birthday?`)) saveBirthdays(birthdays.filter((x)=>x!==bd)) }} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:'.8rem'}}>✕</button>
                  </div>
                </div>
              )
            })}
            <div style={{display:'grid',gap:8,marginTop:12}}>
              <input placeholder="Name" value={newBirthday.name} onChange={e=>setNewBirthday(p=>({...p,name:e.target.value}))}
                style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.88rem',background:'var(--stone)',color:'var(--text)'}} />
              <div style={{display:'flex',gap:8}}>
                <input type="date" value={newBirthday.date} onChange={e=>setNewBirthday(p=>({...p,date:e.target.value}))}
                  style={{flex:1,padding:'9px 8px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.82rem',background:'var(--stone)',color:'var(--text)'}} />
                <input placeholder="Relationship" value={newBirthday.relationship} onChange={e=>setNewBirthday(p=>({...p,relationship:e.target.value}))}
                  style={{flex:1,padding:'9px 8px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.82rem',background:'var(--stone)',color:'var(--text)'}} />
              </div>
              <input placeholder="Notes (gift ideas, traditions...)" value={newBirthday.notes} onChange={e=>setNewBirthday(p=>({...p,notes:e.target.value}))}
                style={{padding:'9px 12px',border:'1.5px solid var(--border2)',borderRadius:'var(--radius-sm)',fontSize:'.85rem',background:'var(--stone)',color:'var(--text)'}} />
              <button className="primary-btn" onClick={()=>{if(!newBirthday.name)return;saveBirthdays([...birthdays,{...newBirthday,id:Date.now()}]);setNewBirthday({name:'',date:'',relationship:'',notes:''})}}>Add Birthday</button>
            </div>
          </section>
        </div>
      </ProTabGate>))}
      <SectionRows sections={S} tabs={TABS} primary={primary} tab={tab} onSelect={pick} subs={SECTION_SUBS} proTabs={PRO_TABS.lifestyle} isPro={isPro} />
    </div>
  )
}

export { LifestylePage }

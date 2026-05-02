import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { usePlannerData } from '../context/PlannerContext.jsx'
import { getTodayString } from '../utils/dates.js'

function LifestylePage() {
  const lsGet = (k, d) => { try { const v = localStorage.getItem('planner.l.' + k); return v ? JSON.parse(v) : d } catch { return d } }
  const lsSet = (k, v) => { try { localStorage.setItem('planner.l.' + k, JSON.stringify(v)) } catch {} }

  const [tab, setTab] = useState('groceries')
  const [trips, setTrips] = useState(() => { try { const v = localStorage.getItem('planner.l.trips'); return v ? JSON.parse(v) : [] } catch { return [] } })
  const [newTrip, setNewTrip] = useState({ destination: '', startDate: '', endDate: '', notes: '', packing: '' })
  const [birthdays, setBirthdays] = useState(() => { try { const v = localStorage.getItem('planner.l.birthdays'); return v ? JSON.parse(v) : [] } catch { return [] } })
  const [newBirthday, setNewBirthday] = useState({ name: '', date: '', relationship: '', notes: '' })
  const saveTrips = (t) => { setTrips(t); try { localStorage.setItem('planner.l.trips', JSON.stringify(t)) } catch {} }
  const saveBirthdays = (b) => { setBirthdays(b); try { localStorage.setItem('planner.l.birthdays', JSON.stringify(b)) } catch {} }
  const [passwords, setPasswords] = useState(() => lsGet('passwords', []))
  const [keyDates, setKeyDates] = useState(() => lsGet('keyDates', []))
  const [contacts, setContacts] = useState(() => lsGet('contacts', []))
  const [groceries, setGroceries] = useState(() => lsGet('groceries', []))
  const [form, setForm] = useState({})
  const save = (key, setter, val) => { setter(val); lsSet(key, val) }

  const TABS = [
    { id: 'groceries', label: '🛒 Groceries' },
    { id: 'trips', label: '✈ Trips' }, { id: 'birthdays', label: '🎂 Birthdays' },
    { id: 'contacts', label: '👥 Contacts' },
    { id: 'workout', label: '💪 Workout' }, { id: 'period', label: '🌸 Period' },
    { id: 'passwords', label: '🔑 Passwords' },
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
      <div style={{display:"flex",alignItems:"center",gap:8,paddingBottom:2}}>
        <span style={{fontSize:"1.1rem"}}>🌍</span>
        <p style={{fontSize:".62rem",fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:"var(--brass)",margin:0}}>Lifestyle</p>
      </div>
      <div className="pill-row" style={{ overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 4 }}>
        {TABS.map(t => (
          <button key={t.id} className={tab === t.id ? 'pill active-pill' : 'pill'}
            onClick={() => setTab(t.id)} style={{ whiteSpace: 'nowrap', fontSize: '.8rem' }}>{t.label}</button>
        ))}
      </div>


      {tab === 'groceries' && (
        <div>
          {/* Custom list */}
          <section className="card">
            <p className="eyebrow">My List</p>
            <h3 style={{ margin: '4px 0 12px' }}>Shopping List</h3>
            {groceries.map((item, i) => (
              <div key={i} onClick={() => save('groceries', setGroceries, groceries.map((g, j) => j === i ? { ...g, done: !g.done } : g))}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                <div style={{ width: 22, height: 22, borderRadius: 6, border: '2px solid', borderColor: item.done ? 'var(--navy)' : 'var(--border2)', background: item.done ? 'var(--navy)' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {item.done && <span style={{ color: 'white', fontWeight: 700, fontSize: '.8rem' }}>✓</span>}
                </div>
                <span style={{ flex: 1, textDecoration: item.done ? 'line-through' : 'none', color: item.done ? 'var(--muted)' : 'var(--ink)', fontSize: '.9rem' }}>{item.label}</span>
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
                onClick={() => { if (!form.grocLabel) return; save('groceries', setGroceries, [...groceries, { label: form.grocLabel, qty: form.grocQty, done: false }]); setForm(p => ({ ...p, grocLabel: '', grocQty: '' })) }}>+</button>
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
            <p className="muted" style={{fontSize:'.8rem',marginBottom:14}}>Tap any item to add it to your shopping list above.</p>
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
              <div key={cat} style={{marginBottom:16}}>
                <div style={{background:color,borderRadius:8,padding:'8px 12px',marginBottom:8}}>
                  <strong style={{fontSize:'.82rem'}}>{cat}</strong>
                </div>
                <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                  {items.map(item => {
                    const alreadyAdded = groceries.some(g => g.label.toLowerCase() === item.toLowerCase())
                    return (
                      <button key={item} onClick={() => {
                        if (alreadyAdded) return
                        save('groceries', setGroceries, [...groceries, { label: item, qty: '', done: false }])
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
              </div>
            ))}
          </section>
        </div>
      )}

      {tab === 'contacts' && (
        <section className="card">
          <p className="eyebrow">Contacts</p>
          <h3 style={{ margin: '4px 0 12px' }}>Key People</h3>
          <SimpleList items={contacts} onDelete={i => save('contacts', setContacts, contacts.filter((_, j) => j !== i))}
            renderItem={item => (<><div style={{ fontWeight: 600, fontSize: '.9rem' }}>{item.name}</div><div style={{ fontSize: '.78rem', color: 'var(--muted)' }}>{item.phone}{item.email ? ' · ' + item.email : ''}{item.notes ? ' · ' + item.notes : ''}</div></>)} />
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            {[['Name', 'cName', 'text'], ['Phone', 'cPhone', 'tel'], ['Email', 'cEmail', 'email'], ['Notes', 'cNotes', 'text']].map(([lbl, key, type]) => (
              <input key={key} type={type} placeholder={lbl} value={form[key] || ''} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                style={{ padding: '9px 12px', border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', fontSize: '.85rem' }} />
            ))}
            <button className="primary-btn" onClick={() => { if (!form.cName) return; save('contacts', setContacts, [...contacts, { name: form.cName, phone: form.cPhone, email: form.cEmail, notes: form.cNotes }]); setForm(p => ({ ...p, cName: '', cPhone: '', cEmail: '', cNotes: '' })) }}>Add Contact</button>
          </div>
        </section>
      )}

      {tab === 'workout' && <WorkoutTrackerTab />}

      {tab === 'period' && <PeriodTrackerTab />}

      {tab === 'passwords' && (
        <section className="card">
          <div style={{ background: 'rgba(240,180,41,.1)', border: '1px solid rgba(240,180,41,.3)', borderRadius: 'var(--radius-sm)', padding: 10, marginBottom: 14, fontSize: '.82rem', color: 'var(--warning)' }}>
            ⚠️ Stored locally on this device only. Do not store critical passwords here without a backup.
          </div>
          <SimpleList items={passwords} onDelete={i => save('passwords', setPasswords, passwords.filter((_, j) => j !== i))}
            renderItem={item => (<><div style={{ fontWeight: 600, fontSize: '.9rem' }}>{item.service}</div><div style={{ fontSize: '.78rem', color: 'var(--muted)', fontFamily: 'monospace' }}>{item.username} · {'•'.repeat(8)}</div></>)} />
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            {[['Service/Website', 'pwSrv', 'text'], ['Username/Email', 'pwUser', 'text'], ['Password', 'pwPass', 'password']].map(([lbl, key, type]) => (
              <input key={key} type={type} placeholder={lbl} value={form[key] || ''} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                style={{ padding: '9px 12px', border: '1.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', fontSize: '.85rem' }} />
            ))}
            <button className="primary-btn" onClick={() => { if (!form.pwSrv) return; save('passwords', setPasswords, [...passwords, { service: form.pwSrv, username: form.pwUser, password: form.pwPass }]); setForm(p => ({ ...p, pwSrv: '', pwUser: '', pwPass: '' })) }}>Save</button>
          </div>
        </section>
      )}

      {tab === 'trips' && (
        <div>
          <section className="card">
            <p className="eyebrow">Trip Planner</p>
            <h3 style={{margin:'4px 0 12px'}}>Upcoming & Past Trips</h3>
            {trips.length === 0 && <p className="muted" style={{fontSize:'.85rem',marginBottom:12}}>No trips planned yet.</p>}
            {trips.map((trip, i) => (
              <div key={i} style={{padding:'12px 0',borderBottom:'1px solid var(--stone2)'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:4}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:'1rem',color:'var(--ink)'}}>{trip.destination}</div>
                    <div style={{fontSize:'.75rem',color:'var(--muted)'}}>{trip.startDate}{trip.endDate ? ' → '+trip.endDate : ''}</div>
                  </div>
                  <button onClick={()=>saveTrips(trips.filter((_,j)=>j!==i))} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}}>✕</button>
                </div>
                {trip.notes && <div style={{fontSize:'.82rem',color:'var(--ink2)',marginBottom:6,lineHeight:1.5}}>{trip.notes}</div>}
                {trip.packing && (
                  <div style={{marginTop:6}}>
                    <div style={{fontSize:'.68rem',fontWeight:700,color:'var(--brass)',letterSpacing:'.08em',marginBottom:4}}>PACKING LIST</div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                      {trip.packing.split(',').map((item,j) => (
                        <span key={j} style={{fontSize:'.72rem',padding:'2px 8px',borderRadius:999,background:'var(--brass-dim)',color:'var(--brass2)',fontWeight:500}}>{item.trim()}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
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
      )}

      {tab === 'birthdays' && (
        <div>
          <section className="card">
            <p className="eyebrow">Birthday Reminders</p>
            <h3 style={{margin:'4px 0 12px'}}>Never miss one</h3>
            {birthdays.length === 0 && <p className="muted" style={{fontSize:'.85rem',marginBottom:12}}>No birthdays added yet.</p>}
            {[...birthdays].sort((a,b)=>{
              const today = new Date()
              const toNext = (dateStr) => {
                if (!dateStr) return 999
                const [,m,d] = dateStr.split('-').map(Number)
                const next = new Date(today.getFullYear(), m-1, d)
                if (next < today) next.setFullYear(today.getFullYear()+1)
                return (next - today) / (1000*60*60*24)
              }
              return toNext(a.date) - toNext(b.date)
            }).map((bd,i) => {
              const daysUntil = (() => {
                if (!bd.date) return null
                const [,m,d] = bd.date.split('-').map(Number)
                const next = new Date(new Date().getFullYear(), m-1, d)
                if (next < new Date()) next.setFullYear(new Date().getFullYear()+1)
                const diff = Math.round((next - new Date()) / (1000*60*60*24))
                return diff
              })()
              return (
                <div key={i} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:'1px solid var(--stone2)'}}>
                  <div style={{width:44,height:44,borderRadius:'50%',background:'var(--brass-dim)',display:'grid',placeItems:'center',flexShrink:0}}>
                    <span style={{fontSize:'1.2rem'}}>🎂</span>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:'.9rem',color:'var(--ink)'}}>{bd.name}</div>
                    <div style={{fontSize:'.75rem',color:'var(--muted)'}}>{bd.relationship} · {bd.date}</div>
                    {bd.notes && <div style={{fontSize:'.75rem',color:'var(--muted)',fontStyle:'italic'}}>{bd.notes}</div>}
                  </div>
                  <div style={{textAlign:'center',flexShrink:0}}>
                    {daysUntil !== null && (
                      <div style={{fontWeight:700,fontSize:'.85rem',color:daysUntil<=7?'var(--danger)':daysUntil<=30?'var(--warning)':'var(--teal)'}}>
                        {daysUntil === 0 ? '🎉 Today!' : `${daysUntil}d`}
                      </div>
                    )}
                    <button onClick={()=>saveBirthdays(birthdays.filter((_,j)=>j!==i))} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:'.8rem'}}>✕</button>
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
      )}
    </div>
  )
}

// ── HEALTH PAGE ───────────────────────────────────────────────────────────


export default LifestylePage

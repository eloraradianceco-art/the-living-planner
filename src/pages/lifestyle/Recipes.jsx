// Lifestyle: recipe cards and the one-tap shopping list.
import { useEffect, useMemo, useState } from 'react'
import { PenLine, ShoppingCart, Plus, Trash2, Check, X, Search, ChevronRight } from 'lucide-react'
import { EmptyState } from '../../components/EmptyState.jsx'

// ── Recipes (2026-11-12): full recipe cards + one-tap shopping list ──────
const RECIPE_CATS = ['Breakfast', 'Lunch', 'Dinner', 'Sides', 'Desserts', 'Drinks']
const RECIPE_BLANK = { title: '', url: '', category: 'Dinner', favorite: false, servings: '', prepTime: '', cookTime: '', ingredients: [], steps: [], notes: '' }
// Accepts an array or pasted text; drops bullets, checkboxes and "1." / "Step 2:" numbering
const toLines = (v, numbered = false) => (Array.isArray(v) ? v : String(v ?? '').split('\n'))
  .map((s) => String(s).trim().replace(/^[-•*▢□☐◦]\s*/, '').replace(numbered ? /^(?:step\s*\d+\s*[.):-]?|\d+\s*[.):-])\s+/i : /$^/, '').trim())
  .filter(Boolean)
const normalizeRecipe = (r) => ({ ...RECIPE_BLANK, ...r, ingredients: toLines(r?.ingredients), steps: toLines(r?.steps, true) })
// Only web links; "allrecipes.com/x" becomes https://allrecipes.com/x
const safeRecipeUrl = (u) => {
  const s = String(u || '').trim()
  if (!s) return ''
  if (/^https?:\/\//i.test(s)) return s
  return /^[a-z][a-z0-9+.-]*:/i.test(s) ? '' : 'https://' + s
}
const QTY_UNITS = 'cups?|c|tablespoons?|tbsps?|tbsp|tbs|teaspoons?|tsps?|tsp|t|fl\\.?\\s?oz|ounces?|oz|pounds?|lbs?|lb|grams?|g|kilograms?|kg|milliliters?|ml|liters?|l|quarts?|qt|pints?|pt|gallons?|gal|cloves?|cans?|jars?|packages?|pkgs?|pkg|packets?|sticks?|slices?|pinch(?:es)?|dash(?:es)?|bunch(?:es)?|heads?|stalks?|sprigs?|boxes|box|bags?|bottles?|containers?|dozen|handfuls?|pieces?'
const QTY_AMOUNT = '(?:\\d+\\s+\\d+\\/\\d+|\\d+(?:[.\\/]\\d+)?\\s*[¼½¾⅓⅔⅛⅜⅝⅞]?|[¼½¾⅓⅔⅛⅜⅝⅞])'
const QTY_RE = new RegExp(`^${QTY_AMOUNT}(?:\\s*(?:-|–|to)\\s*${QTY_AMOUNT})?\\s*`, 'i')
const UNIT_RE = new RegExp(`^(${QTY_UNITS})\\.?\\s+`, 'i')
// "1 (14 oz) can diced tomatoes, drained" → { qty: '1 (14 oz) can', label: 'Diced tomatoes' }
function splitIngredient(line) {
  const raw = String(line || '').trim()
  let s = raw, qty = ''
  const amt = s.match(QTY_RE)
  if (amt && amt[0].trim()) {
    qty = amt[0].trim(); s = s.slice(amt[0].length)
    const paren = s.match(/^\([^)]*\)\s*/)
    if (paren) { qty += ' ' + paren[0].trim(); s = s.slice(paren[0].length) }
    const unit = s.match(UNIT_RE)
    if (unit) { qty += ' ' + unit[1]; s = s.slice(unit[0].length) }
    s = s.replace(/^of\s+/i, '')
  }
  let label = s.split(',')[0].replace(/\([^)]*\)/g, ' ')
    .replace(/\s+(to taste|as needed|for serving|for garnish|optional|divided)\.?$/i, '')
    .replace(/\s+/g, ' ').trim()
  if (!label) label = raw
  return { qty, label: label.charAt(0).toUpperCase() + label.slice(1) }
}
// Matching key so "Tomatoes" on the list counts as "tomato" in a recipe
const singularWord = (w) => /oes$/.test(w) ? w.slice(0, -2) : /ies$/.test(w) ? w.slice(0, -3) + 'y' : (/s$/.test(w) && !/ss$/.test(w) && w.length > 3) ? w.slice(0, -1) : w
const groceryKey = (s) => String(s || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean).map(singularWord).join(' ')
const recipeTime = (r) => [r.prepTime && `Prep ${r.prepTime}`, r.cookTime && `Cook ${r.cookTime}`].filter(Boolean).join(' · ')

function RecipeEditor({ recipe, onSave, onDelete, onClose }) {
  const isNew = !recipe?.id
  const [d, setD] = useState(() => {
    const r = normalizeRecipe(recipe || {})
    return { ...r, ingredientsText: r.ingredients.join('\n'), stepsText: r.steps.join('\n') }
  })
  const set = (k) => (e) => setD((p) => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const submit = (e) => {
    e.preventDefault()
    if (!d.title.trim()) return
    const { ingredientsText, stepsText, ...rest } = d
    onSave({
      ...rest, title: d.title.trim(), url: safeRecipeUrl(d.url),
      servings: String(d.servings || '').trim(), prepTime: String(d.prepTime || '').trim(), cookTime: String(d.cookTime || '').trim(),
      ingredients: toLines(ingredientsText), steps: toLines(stepsText, true), notes: String(d.notes || '').trim(),
      id: recipe?.id || Date.now(),
    })
  }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet recipe-sheet" role="dialog" aria-modal="true" aria-label={isNew ? 'New recipe' : 'Edit recipe'} onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="recipe-sheet-head">
          <h2 className="modal-title" style={{ margin: 0 }}>{isNew ? 'New Recipe' : 'Edit Recipe'}</h2>
          <button type="button" className="recipe-close" onClick={onClose} aria-label="Close"><X size={17} /></button>
        </div>
        <form className="form-grid recipe-form" onSubmit={submit}>
          <label className="full-span">Title<input value={d.title} onChange={set('title')} required placeholder="Grandma's lasagna" /></label>
          <label>Category<select value={d.category} onChange={set('category')}>{RECIPE_CATS.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label>Serves<input value={d.servings} onChange={set('servings')} placeholder="4" inputMode="numeric" /></label>
          <label>Prep time<input value={d.prepTime} onChange={set('prepTime')} placeholder="15 min" /></label>
          <label>Cook time<input value={d.cookTime} onChange={set('cookTime')} placeholder="45 min" /></label>
          <label className="full-span">Ingredients
            <span className="recipe-hint">One per line, like "2 cups flour". Pasting a list works too.</span>
            <textarea value={d.ingredientsText} onChange={set('ingredientsText')} rows={7} placeholder={'1 lb ground beef\n1 (24 oz) jar pasta sauce\n2 cups mozzarella'} />
          </label>
          <label className="full-span">Steps
            <span className="recipe-hint">One step per line. Numbers are added for you.</span>
            <textarea value={d.stepsText} onChange={set('stepsText')} rows={7} placeholder={'Brown the beef and drain.\nStir in the sauce and simmer 10 minutes.'} />
          </label>
          <label className="full-span">Link to the original (optional)<input value={d.url} onChange={set('url')} placeholder="https://…" inputMode="url" autoCapitalize="none" autoCorrect="off" /></label>
          <label className="full-span">Notes<textarea value={d.notes} onChange={set('notes')} rows={3} placeholder="Swaps, family tweaks, what to serve with it…" /></label>
          <label className="full-span recipe-fav"><input type="checkbox" checked={!!d.favorite} onChange={set('favorite')} /> ⭐ Favorite</label>
          <div className="full-span recipe-form-actions">
            {!isNew && <button type="button" className="ghost-btn recipe-delete" onClick={() => onDelete(recipe)}><Trash2 size={15} /> Delete</button>}
            <button type="button" className="ghost-btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary-btn">{isNew ? 'Save Recipe' : 'Save Changes'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function RecipeDetail({ recipe: r, groceries, onClose, onEdit, onToggleFavorite, onAddToList, onViewList }) {
  const parsed = useMemo(() => r.ingredients.map(splitIngredient), [r.ingredients])
  const onList = useMemo(() => {
    const keys = new Set(groceries.filter((g) => !g.done).map((g) => groceryKey(g.label)))
    return parsed.map((p) => keys.has(groceryKey(p.label)))
  }, [parsed, groceries])
  const [skipped, setSkipped] = useState(() => new Set())
  const [cooked, setCooked] = useState(() => new Set())
  const [added, setAdded] = useState(null)
  const picked = parsed.map((p, i) => !onList[i] && !skipped.has(i))
  const count = picked.filter(Boolean).length
  const toggle = (setter, i) => setter((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })
  const addPicked = () => {
    const n = onAddToList(parsed.filter((_, i) => picked[i]), r.title)
    setAdded(n)
  }
  const allPicked = parsed.every((_, i) => onList[i] || !skipped.has(i))
  const meta = [r.category, r.servings && `Serves ${r.servings}`, r.prepTime && `Prep ${r.prepTime}`, r.cookTime && `Cook ${r.cookTime}`].filter(Boolean)
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet recipe-sheet" role="dialog" aria-modal="true" aria-label={r.title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="recipe-sheet-head">
          <h2 className="modal-title recipe-title">{r.title}</h2>
          <button type="button" className="recipe-star" onClick={onToggleFavorite} aria-pressed={!!r.favorite} aria-label={r.favorite ? 'Remove from favorites' : 'Add to favorites'}>{r.favorite ? '⭐' : '☆'}</button>
          <button type="button" className="recipe-close" onClick={onClose} aria-label="Close"><X size={17} /></button>
        </div>
        <div className="recipe-meta">{meta.map((m) => <span key={m}>{m}</span>)}</div>
        {r.url && <a className="recipe-source" href={r.url} target="_blank" rel="noopener noreferrer">Open the original recipe →</a>}

        <div className="recipe-section">
          <div className="recipe-section-head">
            <h3>Ingredients</h3>
            {parsed.length > 0 && parsed.some((_, i) => !onList[i]) && (
              <button type="button" className="recipe-mini" onClick={() => setSkipped(allPicked ? new Set(parsed.map((_, i) => i)) : new Set())}>{allPicked ? 'Select none' : 'Select all'}</button>
            )}
          </div>
          {parsed.length === 0 ? (
            <p className="muted recipe-empty">No ingredients yet. <button type="button" className="recipe-mini" onClick={onEdit}>Add them</button></p>
          ) : (<>
            <ul className="recipe-ingredients">
              {parsed.map((p, i) => (
                <li key={i}>
                  <label className={onList[i] ? 'on-list' : ''}>
                    <input type="checkbox" checked={picked[i]} disabled={onList[i]} onChange={() => toggle(setSkipped, i)} aria-label={`Add ${p.label} to shopping list`} />
                    <span className="recipe-ing-text">{r.ingredients[i]}</span>
                    {onList[i] && <span className="recipe-on-list"><Check size={13} /> On list</span>}
                  </label>
                </li>
              ))}
            </ul>
            <button type="button" className="primary-btn recipe-add-btn" disabled={count === 0} onClick={addPicked}>
              <ShoppingCart size={16} /> {count > 0 ? `Add ${count} to Shopping List` : onList.every(Boolean) ? 'Everything is on your list' : 'Nothing selected'}
            </button>
            {added != null && (
              <p className="recipe-added" role="status">
                {added === 0 ? 'Those were already on your list.' : `Added ${added} item${added === 1 ? '' : 's'} to your shopping list.`}
                {' '}<button type="button" className="recipe-mini" onClick={onViewList}>View list →</button>
              </p>
            )}
          </>)}
        </div>

        <div className="recipe-section">
          <h3>Steps</h3>
          {r.steps.length === 0 ? (
            <p className="muted recipe-empty">{r.url ? 'Steps are on the original recipe.' : 'No steps yet.'} <button type="button" className="recipe-mini" onClick={onEdit}>Add them</button></p>
          ) : (
            <ol className="recipe-steps">
              {r.steps.map((s, i) => (
                <li key={i} className={cooked.has(i) ? 'done' : ''}>
                  <button type="button" onClick={() => toggle(setCooked, i)} aria-pressed={cooked.has(i)}>
                    <span className="recipe-step-num">{cooked.has(i) ? <Check size={14} /> : i + 1}</span>
                    <span>{s}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
          {r.steps.length > 0 && <p className="muted recipe-hint">Tap a step to check it off while you cook.</p>}
        </div>

        {r.notes && (
          <div className="recipe-section">
            <h3>Notes</h3>
            <p className="recipe-notes">{r.notes}</p>
          </div>
        )}

        <div className="recipe-form-actions">
          <button type="button" className="ghost-btn" onClick={onEdit}><PenLine size={15} /> Edit</button>
          <button type="button" className="primary-btn" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}

function RecipeBook({ recipes: raw, onSave, groceries, onAddToList, onViewList, openId, onOpened, onToast }) {
  const recipes = useMemo(() => (raw || []).map(normalizeRecipe), [raw])
  const [filter, setFilter] = useState('All')
  const [query, setQuery] = useState('')
  const [viewId, setViewId] = useState(null)
  const [editing, setEditing] = useState(null) // {} for new, recipe for edit
  useEffect(() => { if (openId) { setViewId(String(openId)); onOpened?.() } }, [openId])
  const viewing = recipes.find((x) => String(x.id) === String(viewId)) || null

  const q = query.trim().toLowerCase()
  const shown = recipes.filter((x) => {
    if (filter === 'Favorites' && !x.favorite) return false
    if (filter !== 'All' && filter !== 'Favorites' && x.category !== filter) return false
    if (q && !`${x.title} ${x.ingredients.join(' ')} ${x.notes}`.toLowerCase().includes(q)) return false
    return true
  })

  const upsert = (rec) => {
    const exists = recipes.some((x) => String(x.id) === String(rec.id))
    onSave(exists ? recipes.map((x) => String(x.id) === String(rec.id) ? rec : x) : [...recipes, rec])
    setEditing(null); setViewId(String(rec.id))
    onToast?.(exists ? 'Recipe updated' : 'Recipe saved', 'Synced across your devices.', 'success')
  }
  const remove = (rec) => {
    if (!window.confirm(`Delete "${rec.title}"?`)) return
    onSave(recipes.filter((x) => String(x.id) !== String(rec.id)))
    setEditing(null); setViewId(null)
  }
  const toggleFav = (rec) => onSave(recipes.map((x) => String(x.id) === String(rec.id) ? { ...x, favorite: !x.favorite } : x))

  return (
    <section className="card">
      <div className="recipe-book-head">
        <div>
          <p className="eyebrow">Recipes</p>
          <h3 style={{ margin: '4px 0 4px' }}>Your Cookbook</h3>
          <p className="muted" style={{ fontSize: '.8rem', margin: 0 }}>Save the recipe, then send its ingredients to your shopping list in one tap.</p>
        </div>
        <button className="primary-btn recipe-new" onClick={() => setEditing({})}><Plus size={16} /> New Recipe</button>
      </div>

      <div className="recipe-filters">
        {['All', 'Favorites', ...RECIPE_CATS].map((cat) => (
          <button key={cat} className={'recipe-pill' + (filter === cat ? ' active' : '')} onClick={() => setFilter(cat)} aria-pressed={filter === cat}>{cat}</button>
        ))}
      </div>
      {recipes.length > 3 && (
        <div className="recipe-search"><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search recipes or ingredients" aria-label="Search recipes" /></div>
      )}

      {shown.length === 0 ? (
        recipes.length === 0
          ? <EmptyState icon="🍳" title="No recipes yet" message="Save your first recipe. Build your family's cookbook over time." />
          : <p className="muted" style={{ fontSize: '.85rem', padding: '12px 0' }}>No recipes match.</p>
      ) : (
        <ul className="recipe-list">
          {shown.map((x) => (
            <li key={x.id}>
              <button className="recipe-row" onClick={() => setViewId(String(x.id))}>
                <span className="recipe-row-main">
                  <strong>{x.favorite && <span className="recipe-row-star">⭐</span>}{x.title}</strong>
                  <span className="recipe-row-meta">
                    <span className="recipe-row-cat">{x.category}</span>
                    {x.ingredients.length > 0 && <span>{x.ingredients.length} ingredient{x.ingredients.length === 1 ? '' : 's'}</span>}
                    {recipeTime(x) && <span>{recipeTime(x)}</span>}
                    {x.url && x.ingredients.length === 0 && <span>Saved link</span>}
                  </span>
                </span>
                <ChevronRight size={16} className="recipe-row-go" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {viewing && !editing && (
        <RecipeDetail key={viewing.id} recipe={viewing} groceries={groceries}
          onClose={() => setViewId(null)} onEdit={() => setEditing(viewing)}
          onToggleFavorite={() => toggleFav(viewing)}
          onAddToList={onAddToList} onViewList={() => { setViewId(null); onViewList() }} />
      )}
      {editing && <RecipeEditor recipe={editing.id ? editing : null} onSave={upsert} onDelete={remove} onClose={() => setEditing(null)} />}
    </section>
  )
}

export { groceryKey, RecipeBook }

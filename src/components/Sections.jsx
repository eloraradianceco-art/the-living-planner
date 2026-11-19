// One page, one open section, the rest as rows (2026-11-19). Health & Wellness, Faith and Productivity used to be
// tabbed; now the main section stays open at the top and every other section is a row underneath, like Home.
//
// How a page uses it:
//   const S = makeSections()                                  // once per render, before the JSX
//   {S.add('sleep', () => (<section>…</section>))}            // each section registers itself, renders nothing
//   <SectionRows sections={S} tabs={TABS} primary="mood" tab={tab} onSelect={setTab} … />   // after the last S.add
//
// `tab` is the page's existing tab state: the open row. It equals `primary` when every row is closed, so links
// like /faith?tab=sermons and buttons that call setTab('recovery') still land on the right section.
// One row is open at a time, and a row's content is only built while it is open.
import React from 'react'
import { Fold } from './Fold.jsx'
import { stripEmoji, emojiOf } from './PageHeader.jsx'

function makeSections() {
  const map = {}
  return { map, add: (id, render) => { map[id] = render; return null } }
}

// For a page whose open section depends on the plan (Finance: Overview with Pro, Budget Plan without). If the plan
// arrives after the page opened and nothing has been tapped yet, move to the right open section.
function usePrimary(tab, setTab, primary) {
  const startedOnDefault = React.useRef(tab === primary)
  const touched = React.useRef(false)
  React.useEffect(() => { if (startedOnDefault.current && !touched.current && tab !== primary) setTab(primary) }, [primary])
  return (id) => { touched.current = true; setTab(id) }
}

function SectionRows({ sections, tabs, primary, tab, onSelect, subs = {}, proTabs = [], isPro = false }) {
  const locked = (t) => !isPro && proTabs.includes(t.id)
  const others = tabs.filter((t) => t.id !== primary)
  const openRows = others.filter((t) => !locked(t))
  const lockedRows = others.filter(locked)
  const lockedOpen = lockedRows.some((t) => t.id === tab)
  const first = React.useRef(true)
  // Bring a row to the top when it opens (a tap, a link from another page, or a button in another section).
  React.useEffect(() => {
    const skip = first.current && tab === primary
    first.current = false
    if (skip || tab === primary) return
    const el = document.getElementById(lockedOpen ? 'sec-pro' : 'sec-' + tab)
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [tab])
  const render = (id) => (sections.map[id] ? sections.map[id]() : null)
  return (
    <>
      {render(primary)}
      {(openRows.length > 0 || lockedRows.length > 0) && (
        <div className="fold-list home-rows section-rows">
          {openRows.map((t) => (
            <Fold key={t.id} id={'sec-' + t.id} emoji={emojiOf(t.label)} title={stripEmoji(t.label)} sub={subs[t.id]}
              open={tab === t.id} onToggle={(isOpen) => onSelect(isOpen ? t.id : primary)}>
              {tab === t.id ? render(t.id) : null}
            </Fold>
          ))}
          {lockedRows.length > 0 && (
            <Fold id="sec-pro" emoji="🔒" title={`${lockedRows.length} more with Pro`}
              sub={lockedRows.map((t) => stripEmoji(t.label)).join(', ')}
              open={lockedOpen} onToggle={(isOpen) => onSelect(isOpen ? lockedRows[0].id : primary)}>
              <div className="section-locked-list">
                {lockedRows.map((t) => (
                  <span key={t.id} className="section-locked-chip"><span aria-hidden="true">{emojiOf(t.label)}</span> {stripEmoji(t.label)}</span>
                ))}
              </div>
              {lockedOpen ? render(tab) : null}
            </Fold>
          )}
        </div>
      )}
    </>
  )
}

export { makeSections, SectionRows, usePrimary }

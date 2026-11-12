import { useState } from 'react'

// "Scripture Credits" section for Settings: the copyright notice each Bible publisher requires
// wherever its translation is quoted. Same file in every Elora Radiance app; each app lists the
// translations it quotes in `notices` and passes its own colors through `theme`.
//   notices: keys of NOTICES, in the order to show them
//   theme:   { text, muted, card, border, body?, heading? }
//   note:    optional extra line shown above the notices

export const NOTICES = {
  ESV: 'Scripture quotations marked (ESV) are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. ESV Text Edition: 2025. The ESV text may not be quoted in any publication made available to the public by a Creative Commons license. The ESV may not be translated in whole or in part into any other language. Used by permission. All rights reserved. The “ESV” and “English Standard Version” are registered trademarks of Crossway. Use of either trademark requires the permission of Crossway.',
  ESV_ALL: 'Unless otherwise indicated, all Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. ESV Text Edition: 2025. The ESV text may not be quoted in any publication made available to the public by a Creative Commons license. The ESV may not be translated in whole or in part into any other language. Used by permission. All rights reserved. The “ESV” and “English Standard Version” are registered trademarks of Crossway. Use of either trademark requires the permission of Crossway.',
  NIV: 'Scripture quotations marked (NIV) are taken from the Holy Bible, New International Version®, NIV®. Copyright © 1973, 1978, 1984, 2011 by Biblica, Inc.® Used by permission of Zondervan. All rights reserved worldwide. www.zondervan.com The “NIV” and “New International Version” are trademarks registered in the United States Patent and Trademark Office by Biblica, Inc.®',
  NIV_ALL: 'All Scripture quotations, unless otherwise indicated, are taken from the Holy Bible, New International Version®, NIV®. Copyright © 1973, 1978, 1984, 2011 by Biblica, Inc.® Used by permission of Zondervan. All rights reserved worldwide. www.zondervan.com The “NIV” and “New International Version” are trademarks registered in the United States Patent and Trademark Office by Biblica, Inc.®',
  NKJV: 'Scripture quotations marked (NKJV) are taken from the New King James Version®. Copyright © 1982 by Thomas Nelson. Used by permission. All rights reserved.',
  NLT: 'Scripture quotations marked (NLT) are taken from the Holy Bible, New Living Translation, copyright ©1996, 2004, 2015 by Tyndale House Foundation. Used by permission of Tyndale House Publishers, Carol Stream, Illinois 60188. All rights reserved.',
  KJV: 'Scripture quotations marked (KJV) are from the King James Version, which is in the public domain in the United States.',
}

export default function ScriptureCredits({ notices, theme: t, note, label = 'Scripture Credits' }) {
  const body = t.body || "'EB Garamond',Georgia,serif"
  const heading = t.heading || "'Cinzel',Georgia,serif"
  const [open, setOpen] = useState(false)
  const list = (notices || []).filter((k) => NOTICES[k])
  if (!list.length) return null
  return (
    <div>
      <div style={{ marginTop: 24, marginBottom: 8 }}>
        <div style={{ fontSize: 9, color: t.muted, letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: heading, marginBottom: 4 }}>{label}</div>
      </div>
      <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 14, padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0' }}>
          <span style={{ fontSize: 18, width: 26, textAlign: 'center' }} aria-hidden="true">📖</span>
          <span style={{ flex: 1, fontSize: 16, color: t.text, fontFamily: body }}>Bible translations used</span>
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} style={{
            background: 'transparent', border: `1px solid ${t.border}`, color: t.muted, padding: '6px 14px',
            borderRadius: 10, fontSize: 12, fontFamily: heading, letterSpacing: '0.06em', cursor: 'pointer',
          }}>{open ? 'Hide' : 'Show'}</button>
        </div>
        {open && (
          <div style={{ paddingBottom: 14 }}>
            {note && <p style={{ fontSize: 14, lineHeight: 1.6, color: t.text, fontFamily: body, margin: '0 0 12px' }}>{note}</p>}
            {list.map((k) => (
              <p key={k} style={{ fontSize: 13, lineHeight: 1.6, color: t.muted, fontFamily: body, margin: '0 0 12px' }}>{NOTICES[k]}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

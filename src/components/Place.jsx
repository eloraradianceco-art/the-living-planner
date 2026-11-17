// A location: link that opens Maps, and a plain-text version for inside buttons.
import { MapPin } from 'lucide-react'

// ── Locations (2026-11-16) ────────────────────────────────────────────
// A place opens in Maps: the Maps app on iPhone, iPad and Mac (the app hands the link to iOS), Apple's web map elsewhere.
const mapsUrl = (place) => `https://maps.apple.com/?q=${encodeURIComponent(String(place || '').trim())}`
const cleanPlace = (place) => String(place || '').trim()
function PlaceLink({ place, className = '' }) {
  const p = cleanPlace(place)
  if (!p) return null
  return (
    <a className={'place-link ' + className} href={mapsUrl(p)} target="_blank" rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()} aria-label={`${p}, open in Maps`}>
      <MapPin size={12} strokeWidth={2.2} aria-hidden="true" /><span>{p}</span>
    </a>
  )
}
// Plain text version for inside buttons (a link can't sit inside a button)
function PlaceText({ place, className = '' }) {
  const p = cleanPlace(place)
  if (!p) return null
  return <span className={'place-text ' + className}><MapPin size={11} strokeWidth={2.2} aria-hidden="true" /><span>{p}</span></span>
}

export { mapsUrl, cleanPlace, PlaceLink, PlaceText }

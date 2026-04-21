import { useEffect, useState } from 'react'

function getMatch(query) {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia(query).matches
}

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(getMatch(query))

  useEffect(() => {
    if (!window.matchMedia) return undefined
    const media = window.matchMedia(query)
    const listener = (event) => setMatches(event.matches)
    setMatches(media.matches)
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [query])

  return matches
}

export function useResponsive() {
  const isMobile = useMediaQuery('(max-width: 760px)')
  const isTablet = useMediaQuery('(min-width: 761px) and (max-width: 1080px)')
  const isDesktop = useMediaQuery('(min-width: 1081px)')
  const prefersTouch = useMediaQuery('(pointer: coarse)')
  return { isMobile, isTablet, isDesktop, prefersTouch }
}

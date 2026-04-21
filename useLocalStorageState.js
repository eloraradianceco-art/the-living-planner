import { useEffect, useState } from 'react'

export function useLocalStorageState(key, initialValue) {
  const [value, setValue] = useState(() => {
    const saved = window.localStorage.getItem(key)
    return saved ? JSON.parse(saved) : initialValue
  })

  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(value))
  }, [key, value])

  return [value, setValue]
}

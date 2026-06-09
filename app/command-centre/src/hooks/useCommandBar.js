import { useState, useEffect, useCallback } from 'react'

export function useCommandBar() {
  const [open, setOpen] = useState(false)

  // ⌘K / Ctrl+K toggle
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Prevent body scroll when open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const openBar  = useCallback(() => setOpen(true),  [])
  const closeBar = useCallback(() => setOpen(false), [])
  const toggle   = useCallback(() => setOpen(o => !o), [])

  return { open, openBar, closeBar, toggle }
}

// Reusable keyboard shortcut hook
export function useKeyboard(key, handler, deps = []) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === key) handler(e)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, deps)
}

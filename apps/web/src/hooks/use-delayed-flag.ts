import { useEffect, useState } from 'react'

// Returns true only after `active` has stayed true for `delay` ms. Used to
// avoid flashing a loading indicator when the underlying work resolves quickly
// (e.g. paginating to an already-cached page).
export function useDelayedFlag(active: boolean, delay = 150) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!active) {
      setVisible(false)
      return
    }
    const id = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(id)
  }, [active, delay])

  return visible
}

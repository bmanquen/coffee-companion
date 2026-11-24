import { useEffect, useRef } from 'react'

// Whether the component is still mounted, read when a callback runs. A form's
// save can settle after the user left it, and must not navigate them then.
export function useMounted() {
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  return mounted
}

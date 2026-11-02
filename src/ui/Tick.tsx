import { m } from 'motion/react'
import { useEffect, useRef } from 'react'
import { tick } from './motion'

/** A live value (Bizi counts): when the text changes it crossfades in place, never slides. The first time it shows, it just appears. */
export function Tick({ children }: { children: string }) {
  const seen = useRef(false)
  useEffect(() => { seen.current = true }, [])
  return <m.span key={children} initial={seen.current ? tick.initial : false} animate={tick.animate} transition={tick.transition}>{children}</m.span>
}

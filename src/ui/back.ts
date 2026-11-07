import { useEffect, useRef } from 'react'

/**
 * Back layers: anything the user can close with Back (a drawer page, a bus line, the Favourites edit mode) registers a layer.
 * Each layer owns one browser history entry, so the Android back gesture closes the top layer and only leaves the app at the root.
 * Settings keeps its own entries (history.state.zgz) on top of these; this file ignores them.
 */
type Layer = { close: () => void }
const layers: Layer[] = []
let entries = 0 // history entries pushed by this file
let ignore = 0 // popstates we caused ourselves
let queued = false

/** Make the history entries match the layers. Runs in a microtask so a layer that unmounts and mounts again at once (dev double effects) costs nothing. */
function sync() {
  if (queued) return
  queued = true
  queueMicrotask(() => {
    queued = false
    while (entries < layers.length) history.pushState({ zgzL: ++entries }, '')
    while (entries > layers.length) { entries--; ignore++; history.back() }
  })
}

function onPop() {
  if (ignore > 0) { ignore--; return }
  const s = history.state
  if (s?.zgz) return // a Settings entry
  const want = Number(s?.zgzL) || 0
  while (layers.length > want) layers.pop()!.close()
  entries = want
}
if (typeof window !== 'undefined') window.addEventListener('popstate', onPop)

/** While `active`, Back calls `close` (once) instead of leaving the app. Closing it another way (a button) just removes the layer. */
export function useBackLayer(active: boolean, close: () => void) {
  const ref = useRef(close)
  ref.current = close
  useEffect(() => {
    if (!active) return
    const layer: Layer = { close: () => ref.current() }
    layers.push(layer)
    sync()
    return () => {
      const i = layers.indexOf(layer)
      if (i >= 0) { layers.splice(i, 1); sync() }
    }
  }, [active])
}

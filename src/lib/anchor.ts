/** Scroll anchoring: the scrollTop that keeps a row at the same place after content above it changed height. */
export function anchoredScrollTop(scrollTop: number, topBefore: number, topAfter: number): number {
  return Math.max(0, scrollTop + (topAfter - topBefore))
}

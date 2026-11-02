/** How far to scroll (positive = down) so a row [rowTop, rowBottom] lies fully inside the viewport [viewTop, viewBottom], with a margin. 0 when it already does. All numbers are screen coordinates. */
export function revealDelta(rowTop: number, rowBottom: number, viewTop: number, viewBottom: number, margin = 8): number {
  const top = viewTop + margin, bottom = viewBottom - margin
  if (rowBottom - rowTop >= bottom - top) return rowTop - top // taller than the view: show its start
  if (rowTop < top) return rowTop - top
  if (rowBottom > bottom) return rowBottom - bottom
  return 0
}

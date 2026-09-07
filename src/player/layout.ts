/** Typography follows the actual square size, including grid lines and border. */
export function gridTypography(width: number, columns: number): { letter: number; number: number; inset: number } {
  const square = (width - 4 - (columns - 1)) / columns
  return {
    letter: Math.min(38, square * 0.56),
    number: Math.min(12, square * 0.29),
    inset: Math.min(7, square * 0.2),
  }
}

/** Desktop grids fit both axes; phones keep their full-width scrolling grid. */
export function desktopGridWidth(width: number, height: number, columns: number, rows: number): number {
  return Math.min(width, height * columns / rows)
}

/** Zoom is a readable cell size, even when the full grid has 45 or 64 columns. */
export function zoomGridWidth(width: number, columns: number): number {
  return Math.max(width * 1.8, columns * 40 + (columns - 1) + 4)
}

/** Reveal an item within one scroll axis, without moving any ancestor. */
export function revealScrollOffset(offset: number, viewportSize: number, itemStart: number, itemSize: number): number {
  if (itemStart < offset) return itemStart
  const visibleEnd = itemStart + Math.min(itemSize, viewportSize)
  if (visibleEnd > offset + viewportSize) return visibleEnd - viewportSize
  return offset
}

/** Frame a whole answer when it fits; otherwise follow its active cell with context. */
export function wordScrollOffset(offset: number, viewportSize: number, wordStart: number, wordSize: number, cellStart: number, cellSize: number): number {
  if (wordSize <= viewportSize) {
    const padding = Math.min(cellSize / 2, (viewportSize - wordSize) / 2)
    return Math.max(0, revealScrollOffset(offset, viewportSize, wordStart - padding, wordSize + padding * 2))
  }
  const padding = Math.min(cellSize, Math.max(0, (viewportSize - cellSize) / 2))
  const next = revealScrollOffset(offset, viewportSize, cellStart - padding, cellSize + padding * 2)
  return Math.max(wordStart, Math.min(wordStart + wordSize - viewportSize, next))
}

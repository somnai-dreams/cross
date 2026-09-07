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

/** Reveal the selected clue within its own column, without moving the page. */
export function clueScrollTop(scrollTop: number, viewportHeight: number, clueTop: number, clueHeight: number): number {
  if (clueTop < scrollTop) return clueTop
  const visibleBottom = clueTop + Math.min(clueHeight, viewportHeight)
  if (visibleBottom > scrollTop + viewportHeight) return visibleBottom - viewportHeight
  return scrollTop
}

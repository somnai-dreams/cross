import { isRecord, parsePuzzle, puzzleFile, puzzleIdentity, type Puzzle } from './puzzle'

export type LibraryEntry = { slug: string; puzzle: Puzzle }

export function createNavigation(library: LibraryEntry[], defaultPuzzle: Puzzle, pathname = '/') {
/** The URL wins over both browser history snapshots and the last-opened preference. */
function resolvePuzzleLocation(search: string, historyState: unknown, lastPuzzle: Puzzle | null): { puzzle: Puzzle; missing: boolean } {
  const slugs = new URLSearchParams(search).getAll('puzzle')
  if (slugs.length > 0) {
    const entry = slugs.length === 1 ? library.find(candidate => candidate.slug === slugs[0]) : undefined
    return entry === undefined ? { puzzle: defaultPuzzle, missing: true } : { puzzle: entry.puzzle, missing: false }
  }
  // Local imports have no public URL. A validated history snapshot lets Back restore them.
  if (isRecord(historyState)) {
    const result = parsePuzzle(historyState['localPuzzle'])
    if (result.ok) return { puzzle: result.value, missing: false }
  }
  return { puzzle: lastPuzzle ?? defaultPuzzle, missing: false }
}

function puzzlePath(puzzle: Puzzle): string | null {
  const entry = library.find(candidate => candidate.puzzle.id === puzzle.id)
  if (entry === undefined || puzzleIdentity(entry.puzzle) !== puzzleIdentity(puzzle)) return null
  return `${pathname}?puzzle=${encodeURIComponent(entry.slug)}`
}

function puzzleHistory(puzzle: Puzzle): { path: string; state: { localPuzzle: Record<string, unknown> } | null } {
  const path = puzzlePath(puzzle)
  return path === null ? { path: pathname, state: { localPuzzle: puzzleFile(puzzle) } } : { path, state: null }
}

return { resolvePuzzleLocation, puzzlePath, puzzleHistory }
}

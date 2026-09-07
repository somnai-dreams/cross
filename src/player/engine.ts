import { isRecord, puzzleIdentity, type Direction, type Entry, type Puzzle, type Result } from './puzzle'

export type Fill = { letter: string; pencil: boolean; mark: 'none' | 'incorrect' | 'revealed' }
export type Progress = { fills: Fill[]; elapsedMs: number; hints: number[]; assisted: boolean }
export type Selection = { cell: number; direction: Direction }
export type Preferences = { skipFilled: boolean; advanceWord: boolean; showTimer: boolean }
export const defaultPreferences: Preferences = { skipFilled: true, advanceWord: true, showTimer: true }
export const emptyFill = (): Fill => ({ letter: '', pencil: false, mark: 'none' })

export function newProgress(puzzle: Puzzle): Progress {
  return { fills: puzzle.cells.map(emptyFill), elapsedMs: 0, hints: [], assisted: false }
}

export function entryAt(puzzle: Puzzle, selection: Selection): Entry {
  const entry = puzzle.entries.find(candidate => candidate.direction === selection.direction && candidate.cells.includes(selection.cell))
  if (entry === undefined) throw new Error('Selection must belong to an entry')
  return entry
}

export function nextEntry(puzzle: Puzzle, entry: Entry, delta: 1 | -1): Entry {
  const ordered = [...puzzle.entries.filter(e => e.direction === 'across'), ...puzzle.entries.filter(e => e.direction === 'down')]
  const index = ordered.indexOf(entry)
  return ordered[(index + delta + ordered.length) % ordered.length]!
}

export function selectEntry(entry: Entry, progress: Progress, skipFilled: boolean): Selection {
  const cell = skipFilled ? entry.cells.find(index => progress.fills[index]!.letter === '') : undefined
  return { cell: cell ?? entry.cells[0]!, direction: entry.direction }
}

export function nextAfterLetter(puzzle: Puzzle, progress: Progress, selection: Selection, preferences: Preferences): Selection {
  const entry = entryAt(puzzle, selection)
  const position = entry.cells.indexOf(selection.cell)
  for (let offset = 1; offset < entry.cells.length; offset++) {
    const index = position + offset
    if (index >= entry.cells.length && !preferences.skipFilled) break
    const cell = entry.cells[index % entry.cells.length]!
    if (!preferences.skipFilled || progress.fills[cell]!.letter === '') return { cell, direction: selection.direction }
  }
  if (!preferences.advanceWord) return selection
  let next = nextEntry(puzzle, entry, 1)
  for (let i = 0; i < puzzle.entries.length; i++) {
    if (next.cells.some(cell => progress.fills[cell]!.letter === '')) return selectEntry(next, progress, preferences.skipFilled)
    next = nextEntry(puzzle, next, 1)
  }
  return selection
}

export function moveArrow(puzzle: Puzzle, selection: Selection, key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'): Selection {
  const direction = key === 'ArrowLeft' || key === 'ArrowRight' ? 'across' : 'down'
  if (direction !== selection.direction) return { ...selection, direction }
  const delta = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1
  const step = direction === 'across' ? delta : delta * puzzle.width
  for (let cell = selection.cell + step; cell >= 0 && cell < puzzle.cells.length; cell += step) {
    if (direction === 'across' && Math.floor(cell / puzzle.width) !== Math.floor(selection.cell / puzzle.width)) break
    if (puzzle.cells[cell]!.kind === 'letter') return { cell, direction }
  }
  return selection
}

export function erase(puzzle: Puzzle, progress: Progress, selection: Selection): Selection {
  let cell = selection.cell
  if (progress.fills[cell]!.letter === '') {
    const entry = entryAt(puzzle, selection)
    cell = entry.cells[Math.max(0, entry.cells.indexOf(cell) - 1)]!
  }
  progress.fills[cell] = emptyFill()
  return { ...selection, cell }
}

export function isSolved(puzzle: Puzzle, progress: Progress): boolean {
  return puzzle.cells.every((cell, index) => cell.kind === 'block' || progress.fills[index]!.letter === cell.solution)
}

export function filledCount(puzzle: Puzzle, progress: Progress): number {
  return puzzle.cells.filter((cell, i) => cell.kind === 'letter' && progress.fills[i]!.letter !== '').length
}

export function checkCells(puzzle: Puzzle, progress: Progress, cells: readonly number[], reveal: boolean): number {
  let affected = 0
  for (const index of cells) {
    const cell = puzzle.cells[index]!
    if (cell.kind === 'block') continue
    const fill = progress.fills[index]!
    if (reveal && fill.letter !== cell.solution) {
      progress.fills[index] = { letter: cell.solution, pencil: false, mark: 'revealed' }
      affected++
    } else if (!reveal && fill.letter !== '') {
      fill.mark = fill.letter === cell.solution ? (fill.mark === 'revealed' ? 'revealed' : 'none') : 'incorrect'
      if (fill.mark === 'incorrect') affected++
    }
  }
  progress.assisted = true
  return affected
}

export function progressFile(puzzle: Puzzle, progress: Progress): Progress & { version: 1; puzzle: string } {
  return { version: 1, puzzle: puzzleIdentity(puzzle), ...progress }
}

export function serializeProgress(puzzle: Puzzle, progress: Progress): string {
  return JSON.stringify(progressFile(puzzle, progress))
}

export function parseProgress(raw: unknown, puzzle: Puzzle): Result<Progress> {
  if (!isRecord(raw) || raw['version'] !== 1 || raw['puzzle'] !== puzzleIdentity(puzzle)) {
    return { ok: false, error: 'Saved progress belongs to a different puzzle version.' }
  }
  const { fills, elapsedMs, hints, assisted } = raw
  if (!Array.isArray(fills) || fills.length !== puzzle.cells.length || typeof elapsedMs !== 'number' ||
    !Number.isFinite(elapsedMs) || elapsedMs < 0 || typeof assisted !== 'boolean' || !Array.isArray(hints)) {
    return { ok: false, error: 'Saved progress is incomplete.' }
  }
  const parsed: Fill[] = []
  for (let i = 0; i < fills.length; i++) {
    const fill: unknown = fills[i]
    if (!isRecord(fill) || typeof fill['letter'] !== 'string' || !/^[A-Z]?$/.test(fill['letter']) ||
      typeof fill['pencil'] !== 'boolean' || !['none', 'incorrect', 'revealed'].includes(String(fill['mark']))) {
      return { ok: false, error: 'Saved progress contains an invalid letter.' }
    }
    const cell = puzzle.cells[i]!
    const mark = fill['mark']
    if (mark !== 'none' && mark !== 'incorrect' && mark !== 'revealed') throw new Error('Validated mark')
    if ((cell.kind === 'block' && (fill['letter'] !== '' || fill['pencil'] || mark !== 'none')) ||
      (fill['letter'] === '' && (fill['pencil'] || mark !== 'none')) ||
      (cell.kind === 'letter' && mark === 'revealed' && (fill['letter'] !== cell.solution || fill['pencil'])) ||
      (cell.kind === 'letter' && mark === 'incorrect' && fill['letter'] === cell.solution)) {
      return { ok: false, error: 'Saved progress does not match this grid.' }
    }
    parsed.push({ letter: fill['letter'], pencil: fill['pencil'], mark })
  }
  const parsedHints: number[] = []
  for (const hint of hints as unknown[]) {
    if (typeof hint !== 'number' || !Number.isInteger(hint) || puzzle.entries[hint] === undefined || parsedHints.includes(hint)) {
      return { ok: false, error: 'Saved hints are invalid.' }
    }
    parsedHints.push(hint)
  }
  if (!assisted && (parsedHints.length > 0 || parsed.some(fill => fill.mark !== 'none'))) {
    return { ok: false, error: 'Saved assistance information is inconsistent.' }
  }
  return { ok: true, value: { fills: parsed, elapsedMs, hints: parsedHints, assisted } }
}

import { decodePuz, fromBase64 } from './puz-format'
import type { PuzHtmlSnapshot } from '../portable'

export type AuthoredPuzzle = {
  version: 1; id: string; title: string; author: string; description?: string
  grid: string[]; across: (string | Clue)[]; down: (string | Clue)[]; circles?: number[]
}
export type Direction = 'across' | 'down'
export type Clue = { text: string; hint: string }
export type Cell = { kind: 'block' } | { kind: 'letter'; solution: string; circled: boolean }
export type Entry = { number: number; direction: Direction; cells: number[]; clue: Clue }
export type Puzzle = {
  id: string; title: string; author: string; description: string
  width: number; height: number; cells: Cell[]; entries: Entry[]
  // Immutable import provenance: preserves fields the solving model cannot represent.
  sourcePuz: string | null
}
export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Row-major starts share a number at crossings, as in the constructor's PrintView. */
export function numberEntries(width: number, cells: readonly Cell[]): Omit<Entry, 'clue'>[] {
  const entries: Omit<Entry, 'clue'>[] = []
  let number = 0
  for (let cell = 0; cell < cells.length; cell++) {
    if (cells[cell]?.kind !== 'letter') continue
    const across = cell % width === 0 || cells[cell - 1]?.kind === 'block'
    const down = cell < width || cells[cell - width]?.kind === 'block'
    if (!across && !down) continue
    number++
    for (const direction of ['across', 'down'] as const) {
      if (!(direction === 'across' ? across : down)) continue
      const step = direction === 'across' ? 1 : width
      const run: number[] = []
      for (let i = cell; i < cells.length && cells[i]?.kind === 'letter'; i += step) {
        if (direction === 'across' && Math.floor(i / width) !== Math.floor(cell / width)) break
        run.push(i)
      }
      entries.push({ number, direction, cells: run })
    }
  }
  return entries
}

function parseClues(value: unknown): Clue[] | null {
  if (!Array.isArray(value)) return null
  const clues: Clue[] = []
  for (const raw of value as unknown[]) {
    if (typeof raw === 'string' && raw.trim() !== '') {
      clues.push({ text: raw.trim(), hint: '' })
    } else if (isRecord(raw) && typeof raw['text'] === 'string' && raw['text'].trim() !== '' &&
      (raw['hint'] === undefined || typeof raw['hint'] === 'string')) {
      clues.push({ text: raw['text'].trim(), hint: typeof raw['hint'] === 'string' ? raw['hint'] : '' })
    } else return null
  }
  return clues
}

/** Own the published format; imports and bundled puzzles pass through the same boundary. */
export function parsePuzzle(raw: unknown): Result<Puzzle> {
  if (isRecord(raw) && raw['version'] === 2) {
    const { puz, id, hints } = raw
    if (typeof puz !== 'string' || puz.length > 2_700_000) return { ok: false, error: 'The embedded .puz data is missing or too large.' }
    let bytes: Uint8Array
    try { bytes = fromBase64(puz) } catch { return { ok: false, error: 'The embedded .puz data is not valid base64.' } }
    const decoded = decodePuz(bytes)
    if (!decoded.ok) return decoded
    const parsed = parsePuzzle({ ...decoded.value, id })
    if (!parsed.ok) return parsed
    if (hints !== undefined) {
      if (!Array.isArray(hints) || hints.length !== parsed.value.entries.length || !(hints as unknown[]).every(hint => typeof hint === 'string')) return { ok: false, error: 'The embedded hints do not match this puzzle.' }
      for (let i = 0; i < hints.length; i++) parsed.value.entries[i]!.clue.hint = hints[i] as string
    }
    parsed.value.sourcePuz = puz
    return parsed
  }
  if (!isRecord(raw) || raw['version'] !== 1) return { ok: false, error: 'Use a version 1 crossword JSON file.' }
  const { id, title, author, description, grid, circles } = raw
  if (typeof id !== 'string' || id.length === 0 || id.length > 160 ||
    typeof title !== 'string' || title.trim() === '' || typeof author !== 'string' ||
    (description !== undefined && typeof description !== 'string')) {
    return { ok: false, error: 'The puzzle needs an id, title, and author.' }
  }
  if (!Array.isArray(grid) || grid.length < 3 || grid.length > 64) {
    return { ok: false, error: 'Grids must have 3–64 rows and columns.' }
  }
  const first: unknown = grid[0]
  if (typeof first !== 'string' || first.length < 3 || first.length > 64) {
    return { ok: false, error: 'Each grid row must contain letters and # for blocks.' }
  }
  const width = first.length
  const cells: Cell[] = []
  for (const row of grid as unknown[]) {
    if (typeof row !== 'string' || row.length !== width || !/^[A-Za-z#]+$/.test(row)) {
      return { ok: false, error: 'Grid rows must have equal lengths and contain only A–Z and #.' }
    }
    for (const char of row.toUpperCase()) {
      cells.push(char === '#' ? { kind: 'block' } : { kind: 'letter', solution: char, circled: false })
    }
  }
  if (circles !== undefined) {
    if (!Array.isArray(circles)) return { ok: false, error: 'Circles must be an array of cell indices.' }
    for (const index of circles as unknown[]) {
      if (typeof index !== 'number' || !Number.isInteger(index)) return { ok: false, error: 'Invalid circled cell.' }
      const cell = cells[index]
      if (cell?.kind !== 'letter') return { ok: false, error: 'Only letter cells can be circled.' }
      cell.circled = true
    }
  }
  const numbered = numberEntries(width, cells)
  if (numbered.length === 0 || numbered.some(entry => entry.cells.length < 3)) {
    return { ok: false, error: 'Every across and down answer must have at least three letters.' }
  }
  // A published grid must be connected. Authoring drafts can be looser.
  const visited = new Set<number>()
  const pending = [numbered[0]!.cells[0]!]
  for (let p = 0; p < pending.length; p++) {
    const index = pending[p]!
    if (visited.has(index)) continue
    visited.add(index)
    const adjacent = [index - width, index + width]
    if (index % width > 0) adjacent.push(index - 1)
    if (index % width < width - 1) adjacent.push(index + 1)
    for (const next of adjacent) if (cells[next]?.kind === 'letter' && !visited.has(next)) pending.push(next)
  }
  if (visited.size !== cells.filter(cell => cell.kind === 'letter').length) {
    return { ok: false, error: 'All letter cells must connect to the rest of the puzzle.' }
  }
  const across = parseClues(raw['across'])
  const down = parseClues(raw['down'])
  if (across === null || down === null ||
    across.length !== numbered.filter(entry => entry.direction === 'across').length ||
    down.length !== numbered.filter(entry => entry.direction === 'down').length) {
    return { ok: false, error: 'Provide one clue for every across and down answer, in number order.' }
  }
  let a = 0
  let d = 0
  const entries = numbered.map(entry => ({ ...entry, clue: entry.direction === 'across' ? across[a++]! : down[d++]! }))
  return { ok: true, value: { id, title: title.trim(), author, description: description ?? '', width, height: grid.length, cells, entries, sourcePuz: null } }
}

export function puzzleIdentity(puzzle: Puzzle): string {
  // Exact content identity prevents progress being reused after an answer changes.
  return JSON.stringify([puzzle.id, puzzle.width, puzzle.cells, puzzle.entries])
}

export function puzzleFile(puzzle: Puzzle): Required<AuthoredPuzzle> | PuzHtmlSnapshot['puzzle'] {
  if (puzzle.sourcePuz !== null) return { version: 2, id: puzzle.id, puz: puzzle.sourcePuz, hints: puzzle.entries.map(entry => entry.clue.hint) }
  const grid: string[] = []
  const circles: number[] = []
  for (let row = 0; row < puzzle.height; row++) {
    let line = ''
    for (let col = 0; col < puzzle.width; col++) {
      const cell = puzzle.cells[row * puzzle.width + col]!
      line += cell.kind === 'block' ? '#' : cell.solution
      if (cell.kind === 'letter' && cell.circled) circles.push(row * puzzle.width + col)
    }
    grid.push(line)
  }
  return {
    version: 1, id: puzzle.id, title: puzzle.title, author: puzzle.author, description: puzzle.description,
    grid, circles,
    across: puzzle.entries.filter(entry => entry.direction === 'across').map(entry => entry.clue),
    down: puzzle.entries.filter(entry => entry.direction === 'down').map(entry => entry.clue),
  }
}

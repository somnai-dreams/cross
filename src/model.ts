export type Issue = { code: 'invalid-json' | 'invalid-data' | 'unsupported' | 'mismatch'; path: string; message: string }
export type Failure = { ok: false; issue: Issue }
export type Result<T> = { ok: true; value: T } | Failure
export function fail(code: Issue['code'], path: string, message: string): Failure {
  return { ok: false, issue: { code, path, message } }
}

export type Direction = 'across' | 'down'
export type Label = number | string
export type Cell = { kind: 'block' } | {
  kind: 'open'; label: Label | null; circled: boolean; rightBar: boolean; bottomBar: boolean
}
export type EntryRef = { start: number; direction: Direction }
export type Clue = { entry: EntryRef; text: string; displayLabel: string; enumeration: string; hints: string[]; continued: EntryRef[] }
export type Puzzle = {
  title: string; author: string; copyright: string; intro: string
  width: number; cells: Cell[]; clues: Clue[]
}
export type AnswerKey = { values: string[]; explanation: string }
export type Verifier =
  | { kind: 'none' }
  | { kind: 'ipuz-sha1'; salt: string; digests: [string, ...string[]] }
  | { kind: 'cross-sha256'; salt: string; digest: string }
export type Attempt = { revision: string; values: string[]; elapsedMs: number }
export type Document = { puzzle: Puzzle; key: AnswerKey | null; verifier: Verifier; attempt: Attempt | null }
export type Assessment = 'incomplete' | 'complete-unverified' | 'correct' | 'incorrect'

export function sameEntry(a: EntryRef, b: EntryRef): boolean {
  return a.start === b.start && a.direction === b.direction
}

/** Geometry owns membership in this rectangular profile. Entry paths are ephemeral. */
export function entryCells(puzzle: Pick<Puzzle, 'width' | 'cells'>, entry: EntryRef): number[] {
  const output: number[] = []
  const step = entry.direction === 'across' ? 1 : puzzle.width
  for (let index = entry.start; index < puzzle.cells.length; index += step) {
    const cell = puzzle.cells[index]!
    if (cell.kind === 'block') break
    output.push(index)
    if (entry.direction === 'across' ? cell.rightBar || (index + 1) % puzzle.width === 0 : cell.bottomBar) break
  }
  return output
}

export function entries(puzzle: Pick<Puzzle, 'width' | 'cells'>): EntryRef[] {
  const output: EntryRef[] = []
  for (const direction of ['across', 'down'] as const) {
    const step = direction === 'across' ? 1 : puzzle.width
    for (let start = 0; start < puzzle.cells.length; start++) {
      if (puzzle.cells[start]!.kind === 'block') continue
      const previous = puzzle.cells[start - step]
      const edge = direction === 'across' ? start % puzzle.width === 0 : start < puzzle.width
      if (!edge && previous !== undefined && previous.kind === 'open' &&
          !(direction === 'across' ? previous.rightBar : previous.bottomBar)) continue
      const entry = { start, direction }
      if (entryCells(puzzle, entry).length >= 2) output.push(entry)
    }
  }
  return output
}

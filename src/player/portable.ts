import { toBase64 } from '../puz'
import { readPuzHtml, readPuzHtmlData, writePuzHtml, type PlayerAssets, type PuzHtmlSnapshot } from '../portable'
import { encodePuz } from './puz-format'
import { parseProgress, progressFile, type Progress } from './engine'
import { parsePuzzle, type Puzzle, type Result } from './puzzle'
import type { PlayerConfiguration } from './config'

export type { PlayerAssets } from '../portable'
export type PortablePuzzle = { puzzle: Puzzle; progress: Progress | null }

/** Cross validates the envelope; this player owns its puzzle and progress rules. */
function playerSnapshot(snapshot: PuzHtmlSnapshot): Result<PortablePuzzle> {
  const puzzle = parsePuzzle(snapshot.puzzle)
  if (!puzzle.ok) return puzzle
  if (snapshot.progress === null) return { ok: true, value: { puzzle: puzzle.value, progress: null } }
  const progress = parseProgress(snapshot.progress, puzzle.value)
  return progress.ok ? { ok: true, value: { puzzle: puzzle.value, progress: progress.value } } : progress
}

export function readPortableHtml(bytes: Uint8Array<ArrayBuffer>): Result<PortablePuzzle> {
  const parsed = readPuzHtml(bytes)
  return parsed.ok ? playerSnapshot(parsed.value) : { ok: false, error: parsed.issue.message }
}

export function parsePortable(text: string): Result<PortablePuzzle> {
  const parsed = readPuzHtmlData(text)
  return parsed.ok ? playerSnapshot(parsed.value) : { ok: false, error: parsed.issue.message }
}

export function portableHtml(puzzle: Puzzle, progress: Progress | null, assets: PlayerAssets, publisher?: Pick<PlayerConfiguration, 'brand' | 'homeUrl' | 'storageKey'>): Result<Uint8Array<ArrayBuffer>> {
  const encoded = encodePuz(puzzle)
  if (!encoded.ok) return encoded
  const file: PuzHtmlSnapshot = {
    puzzle: { version: 2, id: puzzle.id, puz: toBase64(encoded.value), hints: puzzle.entries.map(entry => entry.clue.hint) },
    progress: progress === null ? null : progressFile(puzzle, progress),
  }
  // A download stands alone, even when its source player was embedded in a host page.
  const options = publisher === undefined ? {} : { configuration: { version: 1, ...publisher, mode: 'standalone', chrome: 'full', library: [] } }
  const exported = writePuzHtml(file, assets, { title: puzzle.title, ...options })
  return exported.ok ? exported : { ok: false, error: exported.issue.message }
}

export function puzzleFilename(puzzle: Puzzle): string {
  const name = puzzle.title.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase()
  return name === '' ? 'crossword' : name
}

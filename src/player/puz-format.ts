import { decodePuz as decodeNativePuz, encodePuz as encodeNativePuz, fromBase64, type PuzData } from '../puz'
import type { Puzzle, Result } from './puzzle'

export { checksum, fromBase64, puzPayload, toBase64 } from '../puz'

type AuthoredPuz = Pick<PuzData, 'title' | 'author' | 'grid' | 'across' | 'down' | 'circles'> & { version: 1; description: string }

/** Adapt Cross's native fields to the player's authored-input boundary. */
export function decodePuz(bytes: Uint8Array): Result<AuthoredPuz> {
  const decoded = decodeNativePuz(bytes)
  if (!decoded.ok) return { ok: false, error: decoded.issue.message }
  const { title, author, notes, grid, across, down, circles } = decoded.value
  return { ok: true, value: { version: 1, title, author, description: notes, grid, across, down, circles } }
}

export function encodePuz(puzzle: Puzzle): Result<Uint8Array<ArrayBuffer>> {
  // Immutable source bytes preserve metadata this UI does not own.
  if (puzzle.sourcePuz !== null) return { ok: true, value: fromBase64(puzzle.sourcePuz) }
  const grid: string[] = [], circles: number[] = []
  for (let row = 0; row < puzzle.height; row++) {
    let line = ''
    for (let column = 0; column < puzzle.width; column++) {
      const index = row * puzzle.width + column, cell = puzzle.cells[index]!
      line += cell.kind === 'block' ? '#' : cell.solution
      if (cell.kind === 'letter' && cell.circled) circles.push(index)
    }
    grid.push(line)
  }
  const encoded = encodeNativePuz({
    title: puzzle.title, author: puzzle.author, copyright: '', notes: puzzle.description, grid, circles,
    across: puzzle.entries.filter(entry => entry.direction === 'across').map(entry => entry.clue.text),
    down: puzzle.entries.filter(entry => entry.direction === 'down').map(entry => entry.clue.text),
  })
  return encoded.ok ? encoded : { ok: false, error: encoded.issue.message }
}

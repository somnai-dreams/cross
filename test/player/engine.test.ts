import { describe, expect, test } from 'bun:test'
import { library, puzzleFiles } from './fixtures'
import { parsePuzzle, puzzleFile } from '../../src/player/puzzle'
import { checkCells, defaultPreferences, emptyFill, entryAt, erase, isSolved, moveArrow, newProgress, nextAfterLetter, nextEntry, parseProgress, selectEntry, serializeProgress } from '../../src/player/engine'
import { clueScrollTop, desktopGridWidth, gridTypography } from '../../src/player/layout'

test('desktop grids fit short windows and rectangular puzzles on both axes', () => {
  for (const [width, height, columns, rows] of [[510, 380, 15, 15], [350, 700, 15, 15], [510, 400, 5, 25], [510, 400, 25, 5]] as const) {
    const size = desktopGridWidth(width, height, columns, rows)
    expect(size).toBeLessThanOrEqual(width)
    expect(size * rows / columns).toBeLessThanOrEqual(height)
    expect(size).toBeGreaterThan(0)
  }
})

describe('desktop clue scrolling', () => {
  test('keeps an already visible clue in place', () => {
    expect(clueScrollTop(300, 400, 350, 80)).toBe(300)
  })
  test('reveals later clues and returns to the first clue on wraparound', () => {
    const last = clueScrollTop(0, 400, 2100, 80)
    expect(last).toBe(1780)
    expect(clueScrollTop(last, 400, 0, 80)).toBe(0)
  })
  test('reveals the beginning of a clue taller than the scroll area', () => {
    const top = clueScrollTop(0, 200, 600, 350)
    expect(top).toBe(600)
    expect(clueScrollTop(top, 200, 600, 350)).toBe(top)
  })
})

const puzzle = library[0]!.puzzle
const across = puzzle.entries.filter(entry => entry.direction === 'across')
const down = puzzle.entries.filter(entry => entry.direction === 'down')

describe('published puzzle boundary', () => {
  test('shares start numbers at intersections and keeps the original clue association', () => {
    expect(across.map(entry => entry.number)).toEqual([1, 4, 6, 7, 8])
    expect(down.map(entry => entry.number)).toEqual([1, 2, 3, 4, 5])
    expect(down[0]!.cells).toEqual([1, 6, 11, 16, 21])
    expect(down[0]!.clue.text).toBe('Give a shelter pet a home')
  })
  test('round trips without duplicating or losing a solution or clue', () => {
    expect(parsePuzzle(puzzleFile(puzzle))).toEqual({ ok: true, value: puzzle })
  })
  test('rejects malformed rows, short entries, missing clues, and circles on blocks', () => {
    expect(parsePuzzle({ ...puzzleFiles[0], grid: ['#AND#', 'INVALID'] }).ok).toBe(false)
    expect(parsePuzzle({ ...puzzleFiles[0], grid: ['#AN##', 'IDEAS', 'MOVIE', 'OPERA', '#TRY#'] }).ok).toBe(false)
    expect(parsePuzzle({ ...puzzleFiles[0], across: [] }).ok).toBe(false)
    expect(parsePuzzle({ ...puzzleFiles[0], circles: [0] }).ok).toBe(false)
  })
  test('accepts lowercase grid input and normalizes it once', () => {
    const file = puzzleFiles[0]!
    const result = parsePuzzle({ ...file, grid: file.grid.map(row => row.toLowerCase()) })
    expect(result).toEqual({ ok: true, value: puzzle })
  })
})

describe('solver navigation', () => {
  test('direction changes keep the square; the next arrow moves along that direction', () => {
    const turned = moveArrow(puzzle, { cell: 1, direction: 'across' }, 'ArrowDown')
    expect(turned).toEqual({ cell: 1, direction: 'down' })
    expect(moveArrow(puzzle, turned, 'ArrowDown')).toEqual({ cell: 6, direction: 'down' })
  })
  test('arrows stop at the edge and skip blocks without wrapping to another row', () => {
    expect(moveArrow(puzzle, { cell: 3, direction: 'across' }, 'ArrowRight').cell).toBe(3)
    expect(moveArrow(puzzle, { cell: 1, direction: 'across' }, 'ArrowLeft').cell).toBe(1)
    expect(moveArrow(puzzle, { cell: 23, direction: 'down' }, 'ArrowDown').cell).toBe(23)
  })
  test('Tab goes through all across clues, then down, and wraps in both directions', () => {
    expect(nextEntry(puzzle, across.at(-1)!, 1)).toBe(down[0]!)
    expect(nextEntry(puzzle, down.at(-1)!, 1)).toBe(across[0]!)
    expect(nextEntry(puzzle, across[0]!, -1)).toBe(down.at(-1)!)
  })
  test('typing skips a crossed letter and advances to the next unfinished clue', () => {
    const progress = newProgress(puzzle)
    progress.fills[1] = { ...emptyFill(), letter: 'A' }
    progress.fills[2] = { ...emptyFill(), letter: 'N' }
    expect(nextAfterLetter(puzzle, progress, { cell: 1, direction: 'across' }, defaultPreferences).cell).toBe(3)
    progress.fills[3] = { ...emptyFill(), letter: 'D' }
    expect(nextAfterLetter(puzzle, progress, { cell: 3, direction: 'across' }, defaultPreferences)).toEqual({ cell: 5, direction: 'across' })
  })
  test('skip-filled wraps to an earlier gap before leaving the current entry', () => {
    const progress = newProgress(puzzle)
    progress.fills[2] = { ...emptyFill(), letter: 'N' }
    progress.fills[3] = { ...emptyFill(), letter: 'D' }
    expect(nextAfterLetter(puzzle, progress, { cell: 3, direction: 'across' }, defaultPreferences).cell).toBe(1)
  })
  test('disabling skip and advance preserves deliberate overwriting at word ends', () => {
    const progress = newProgress(puzzle)
    const preferences = { ...defaultPreferences, skipFilled: false, advanceWord: false }
    progress.fills[2] = { ...emptyFill(), letter: 'N' }
    expect(nextAfterLetter(puzzle, progress, { cell: 1, direction: 'across' }, preferences).cell).toBe(2)
    expect(nextAfterLetter(puzzle, progress, { cell: 3, direction: 'across' }, preferences).cell).toBe(3)
  })
  test('Backspace clears a letter first, then backs into and erases the previous square', () => {
    const progress = newProgress(puzzle)
    progress.fills[2] = { ...emptyFill(), letter: 'N' }
    progress.fills[3] = { ...emptyFill(), letter: 'D' }
    const selection = { cell: 3, direction: 'across' } as const
    expect(erase(puzzle, progress, selection)).toEqual(selection)
    expect(progress.fills[3].letter).toBe('')
    expect(erase(puzzle, progress, selection).cell).toBe(2)
    expect(progress.fills[2].letter).toBe('')
  })
  test('a crossing has a single player letter used by both clues', () => {
    const progress = newProgress(puzzle)
    progress.fills[1] = { ...emptyFill(), letter: 'A' }
    expect(entryAt(puzzle, { cell: 1, direction: 'across' }).cells).toContain(1)
    expect(entryAt(puzzle, { cell: 1, direction: 'down' }).cells).toContain(1)
    expect(selectEntry(down[0]!, progress, true).cell).toBe(6)
    expect(selectEntry(down[0]!, progress, false).cell).toBe(1)
  })
})

describe('checking, completion, and saved progress', () => {
  test('checking identifies mistakes without erasing; revealing affects only requested squares', () => {
    const progress = newProgress(puzzle)
    progress.fills[1] = { ...emptyFill(), letter: 'Z' }
    expect(checkCells(puzzle, progress, [1, 2], false)).toBe(1)
    expect(progress.fills[1]).toEqual({ letter: 'Z', pencil: false, mark: 'incorrect' })
    expect(progress.fills[2]!.mark).toBe('none')
    expect(checkCells(puzzle, progress, [1], true)).toBe(1)
    expect(progress.fills[1]).toEqual({ letter: 'A', pencil: false, mark: 'revealed' })
    expect(progress.fills[2]!.letter).toBe('')
  })
  test('a full but incorrect grid is not solved', () => {
    const progress = newProgress(puzzle)
    puzzle.cells.forEach((cell, i) => { if (cell.kind === 'letter') progress.fills[i] = { ...emptyFill(), letter: 'X' } })
    expect(isSolved(puzzle, progress)).toBe(false)
    checkCells(puzzle, progress, puzzle.cells.map((_, i) => i), true)
    expect(isSolved(puzzle, progress)).toBe(true)
    expect(progress.assisted).toBe(true)
  })
  test('restores pencil, hints, and time, and refuses the same id with changed answers', () => {
    const progress = newProgress(puzzle)
    progress.fills[1] = { letter: 'A', pencil: true, mark: 'none' }
    progress.elapsedMs = 65123; progress.hints = [0]; progress.assisted = true
    const raw: unknown = JSON.parse(serializeProgress(puzzle, progress))
    expect(parseProgress(raw, puzzle)).toEqual({ ok: true, value: progress })
    const changed = structuredClone(puzzle)
    changed.cells[1] = { kind: 'letter', solution: 'Z', circled: false }
    expect(parseProgress(raw, changed).ok).toBe(false)
  })
  test('rejects corrupt block fill, inconsistent reveal flags, and invalid time', () => {
    const progress = newProgress(puzzle)
    progress.fills[0] = { ...emptyFill(), letter: 'X' }
    expect(parseProgress(JSON.parse(serializeProgress(puzzle, progress)), puzzle).ok).toBe(false)
    progress.fills[0] = emptyFill()
    progress.fills[1] = { letter: 'Z', pencil: false, mark: 'revealed' }
    expect(parseProgress(JSON.parse(serializeProgress(puzzle, progress)), puzzle).ok).toBe(false)
    progress.fills[1] = emptyFill(); progress.elapsedMs = -1
    expect(parseProgress(JSON.parse(serializeProgress(puzzle, progress)), puzzle).ok).toBe(false)
  })
})

test('letters and clue numbers fit their squares at phone, tablet, and zoomed widths', () => {
  for (const width of [304, 359, 374, 414, 510, 744]) {
    for (const columns of [5, 15, 21, 25]) {
      for (const zoom of [1, 1.8]) {
        const square = (width * zoom - 4 - (columns - 1)) / columns
        const type = gridTypography(width * zoom, columns)
        expect(type.letter + type.inset).toBeLessThan(square)
        expect(type.number * 2 + square * 0.12).toBeLessThan(square)
        expect(type.letter).toBeGreaterThan(0)
        expect(type.letter).toBeLessThanOrEqual(38)
      }
    }
  }
})

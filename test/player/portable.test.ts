import { expect, test } from 'bun:test'
import { library } from './fixtures'
import { newProgress } from '../../src/player/engine'
import { importPuzzle, parsePuz } from '../../src/player/puz'
import { encodePuz, puzPayload, fromBase64 } from '../../src/player/puz-format'
import { portableHtml, readPortableHtml } from '../../src/player/portable'
import { parsePuzzle, puzzleFile, puzzleIdentity } from '../../src/player/puzzle'

const assets = { css: '@import url("https://example.com/fonts"); body { color: black }', script: 'document.title="ACROSS&DOWN";' }

test('one file carries the same puzzle for the HTML player and .puz readers', async () => {
  for (const { puzzle } of library) {
    const file = portableHtml(puzzle, null, assets)
    if (!file.ok) throw new Error(file.error)
    const html = readPortableHtml(file.value), puz = await parsePuz(file.value.buffer)
    if (!html.ok) throw new Error(html.error)
    if (!puz.ok) throw new Error(puz.error)
    expect(puzzleIdentity(html.value.puzzle)).toBe(puzzleIdentity(puzzle))
    expect(puz.value.cells).toEqual(puzzle.cells)
    expect(puz.value.entries.map(entry => entry.clue.text)).toEqual(puzzle.entries.map(entry => entry.clue.text))
    const source = html.value.puzzle.sourcePuz
    if (source === null) throw new Error('Missing native .puz source')
    expect(puzPayload(file.value)).toEqual(fromBase64(source))
    expect(new TextDecoder().decode(file.value).startsWith('<!doctype html>')).toBe(true)
    expect(new TextDecoder().decode(file.value)).not.toContain('@import')
    // Renaming does not alter the file. Both import paths must accept its bytes.
    expect((await importPuzzle(file.value.buffer, 'puzzle.html')).ok).toBe(true)
    expect((await importPuzzle(file.value.buffer, 'puzzle.puz')).ok).toBe(true)
  }
})

test('progress and extra hints survive HTML snapshots and native-puzzle persistence', () => {
  const puzzle = library[0]!.puzzle, progress = newProgress(puzzle)
  progress.fills[1] = { letter: 'A', pencil: true, mark: 'none' }
  progress.elapsedMs = 24000; progress.hints = [0]; progress.assisted = true
  const file = portableHtml(puzzle, progress, assets)
  if (!file.ok) throw new Error(file.error)
  const result = readPortableHtml(file.value)
  if (!result.ok) throw new Error(result.error)
  expect(result.value.progress).toEqual(progress)
  expect(result.value.puzzle.entries).toEqual(puzzle.entries)
  const restored = parsePuzzle(JSON.parse(JSON.stringify(puzzleFile(result.value.puzzle))) as unknown)
  if (!restored.ok) throw new Error(restored.error)
  expect(restored.value).toEqual(result.value.puzzle)
})

test('re-export does not accumulate HTML wrappers, and plain .puz stays compact', async () => {
  const first = portableHtml(library[0]!.puzzle, null, assets)
  if (!first.ok) throw new Error(first.error)
  const imported = await parsePuz(first.value.buffer)
  if (!imported.ok) throw new Error(imported.error)
  const plain = encodePuz(imported.value)
  if (!plain.ok) throw new Error(plain.error)
  expect(plain.value).toEqual(puzPayload(first.value))
  expect(plain.value.length).toBeLessThan(5000)
  const second = portableHtml(imported.value, null, assets)
  if (!second.ok) throw new Error(second.error)
  expect(puzPayload(second.value)).toEqual(plain.value)
  const text = new TextDecoder().decode(second.value)
  expect(text.split('<!doctype html>')).toHaveLength(2)
})

test('import treats markup as data and rejects divergent HTML / binary puzzle copies', () => {
  const puzzle = structuredClone(library[0]!.puzzle)
  puzzle.title = '</script><script>alert(1)</script> ACROSS&DOWN'
  const file = portableHtml(puzzle, null, assets)
  if (!file.ok) throw new Error(file.error)
  const parsed = readPortableHtml(file.value)
  if (!parsed.ok) throw new Error(parsed.error)
  expect(parsed.value.puzzle.title).toBe(puzzle.title)
  const text = new TextDecoder().decode(file.value)
  expect(text.indexOf('alert(1)')).toBeGreaterThan(text.indexOf('<plaintext hidden'))
  const different = encodePuz(library[1]!.puzzle)
  if (!different.ok) throw new Error(different.error)
  const prefix = file.value.slice(0, file.value.length - puzPayload(file.value).length)
  const altered = new Uint8Array(prefix.length + different.value.length)
  altered.set(prefix); altered.set(different.value, prefix.length)
  expect(readPortableHtml(altered).ok).toBe(false)
})

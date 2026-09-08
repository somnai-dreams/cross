import { expect, test } from 'bun:test'
import { createHtml, createCollectionHtml } from '../src/html'
import { decodePuz, puzPayload, fromBase64 } from '../src'
import { readPortableHtml } from '../src/player/portable'
import { readConfiguration } from '../src/player/config'
import { newProgress } from '../src/player/engine'
import { portableHtml } from '../src/player/portable'
import { mountPlayer } from '../src/embed'
import { library, puzzleFiles } from './player/fixtures'

function value<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) throw new Error(JSON.stringify(result))
  return result.value
}

// The one-call API is exercised without providing or building renderer assets.
test('puzzle data produces a complete player with no supplied assets or bundled collection', async () => {
  const file = value(await createHtml(puzzleFiles[0]!))
  const parsed = value(readPortableHtml(file))
  expect(parsed.puzzle.entries).toEqual(library[0]!.puzzle.entries)
  const text = new TextDecoder().decode(file)
  expect(text).toContain('<style id="player-style">')
  expect(text).toContain('id="player-code" type="module" src="data:text/javascript;base64,')
  expect(text).not.toContain('crossword-config')
  const scriptMatch = /src="data:text\/javascript;base64,([^"]+)"/.exec(text)
  expect(scriptMatch).not.toBeNull()
  const script = new TextDecoder().decode(fromBase64(scriptMatch![1]!))
  expect(script).toContain('On-screen keyboard')
  expect(script).not.toContain('Early bird')
  expect(script).not.toContain('Time out (v2)')
  expect(script).not.toContain('fetch(')
  expect(script).not.toContain('Cross Composer')
  expect(value(decodePuz(puzPayload(file))).grid).toEqual(puzzleFiles[0]!.grid)
  expect(file.length).toBeLessThan(120_000)
})

test('native UTF-8 bytes produce a playable file and preserve the original payload', async () => {
  const native = new Uint8Array(await Bun.file(`${import.meta.dir}/../fixtures/native-utf8.puz`).arrayBuffer())
  const file = value(await createHtml(native))
  expect(puzPayload(file)).toEqual(native)
  expect(value(readPortableHtml(file)).puzzle.title).toBe('Symbols → ♠')
})

test('invalid puzzle and progress fail before producing an HTML file', async () => {
  expect((await createHtml(new Uint8Array([1, 2, 3]))).ok).toBe(false)
  expect((await createHtml({ ...puzzleFiles[0]!, across: [] })).ok).toBe(false)
  const progress = newProgress(library[0]!.puzzle)
  progress.fills[0]!.letter = 'X'
  expect((await createHtml(puzzleFiles[0]!, { progress })).ok).toBe(false)
  progress.fills[0]!.letter = ''
  progress.fills[1] = { letter: 'A', pencil: true, mark: 'none' }
  const html = value(await createHtml(puzzleFiles[0]!, { progress }))
  expect(value(readPortableHtml(html)).progress).toEqual(progress)
})

test('collection configuration is validated and brand text is inert', async () => {
  const title = '</script><script>alert(1)</script>'
  const collection = { puzzles: puzzleFiles.map(puzzle => ({ slug: puzzle.slug, puzzle })), defaultSlug: 'early-bird', title }
  const file = value(await createCollectionHtml(collection))
  const text = new TextDecoder().decode(file)
  expect(text).not.toContain(title)
  const raw = /<script id="crossword-config" type="application\/json">(.*?)<\/script>/.exec(text)![1]!
  const parsed = value(readPortableHtml(file))
  const config = value(readConfiguration(raw, parsed.puzzle))
  expect(config.brand).toBe(title)
  expect(config.library.map(entry => entry.slug)).toEqual(puzzleFiles.map(puzzle => puzzle.slug))
  expect((await createCollectionHtml({ ...collection, defaultSlug: 'absent' })).ok).toBe(false)
  expect((await createCollectionHtml({ ...collection, puzzles: [...collection.puzzles, collection.puzzles[0]!] })).ok).toBe(false)
  expect(readConfiguration('{"version":1}', parsed.puzzle).ok).toBe(false)
})

test('headless entry point does not pull in the renderer, styles or generated assets', async () => {
  const result = await Bun.build({ entrypoints: [`${import.meta.dir}/headless-entry.ts`], target: 'browser', minify: true })
  expect(result.success).toBe(true)
  const script = await result.outputs[0]!.text()
  expect(script).not.toContain('On-screen keyboard')
  expect(script).not.toContain('querySelector(')
  expect(script.length).toBeGreaterThan(1_000)
  expect(script.length).toBeLessThan(8_000)
  expect(script).toContain('ACROSS&DOWN')
})

test('a publisher can brand a standalone player and link home without changing its puzzle', async () => {
  const file = value(await createHtml(puzzleFiles[0]!, { site: { name: 'Cross Daily', homeUrl: '/' } }))
  const parsed = value(readPortableHtml(file))
  const text = new TextDecoder().decode(file)
  const raw = /<script id="crossword-config" type="application\/json">(.*?)<\/script>/.exec(text)![1]!
  expect(value(readConfiguration(raw, parsed.puzzle))).toMatchObject({ brand: 'Cross Daily', homeUrl: '/', mode: 'standalone', library: [] })
  expect(parsed.puzzle.entries).toEqual(library[0]!.puzzle.entries)
  for (const homeUrl of ['javascript:alert(1)', 'data:text/html,test', '//example.com', 'https://']) {
    expect((await createHtml(puzzleFiles[0]!, { site: { name: 'Publisher', homeUrl } })).ok).toBe(false)
  }
})

test('the included UI accepts a 45x45 puzzle without needing a separate renderer', async () => {
  const large = { version: 1 as const, id: 'large', title: 'Large grid', author: 'Synthetic', grid: Array<string>(45).fill('A'.repeat(45)), across: Array<string>(45).fill('Across'), down: Array<string>(45).fill('Down') }
  const html = value(await createHtml(large))
  expect(value(readPortableHtml(html)).puzzle.width).toBe(45)
})

test('publisher CSS survives standalone re-export without repeating the styles or leaking its collection', async () => {
  const css = ':scope { --accent: #ac1234; --font: Georgia, serif } [data-cross-part="clue"] { padding: 4px }'
  const html = value(await createCollectionHtml({
    puzzles: puzzleFiles.map(puzzle => ({ slug: puzzle.slug, puzzle })), defaultSlug: 'early-bird', title: 'Publisher', css,
  }))
  const text = new TextDecoder().decode(html)
  const style = /<style id="player-style">([\s\S]*?)<\/style>/.exec(text)![1]!
  const script = new TextDecoder().decode(fromBase64(/src="data:text\/javascript;base64,([^"]+)"/.exec(text)![1]!))
  const parsed = value(readPortableHtml(html))
  const publisher = { brand: 'Publisher', homeUrl: 'https://example.com/puzzles/', storageKey: 'cross' }
  const exported = value(portableHtml(parsed.puzzle, null, { css: style, script }, publisher))
  const reopened = new TextDecoder().decode(exported)
  expect(reopened.match(/--accent: #ac1234/g)).toHaveLength(1)
  expect(reopened).toContain(css)
  const config = /<script id="crossword-config" type="application\/json">(.*?)<\/script>/.exec(reopened)![1]!
  expect(value(readConfiguration(config, parsed.puzzle))).toEqual({ ...publisher, mode: 'standalone', chrome: 'full', library: [] })
  expect(puzPayload(exported)).toEqual(puzPayload(html))
})

test('CSS text cannot terminate its HTML element and change the portable envelope', async () => {
  const css = '[data-cross-part="heading"]::after { content: "</style><script>alert(1)</script>" }'
  const html = value(await createHtml(puzzleFiles[0]!, { css, chrome: 'puzzle' }))
  const text = new TextDecoder().decode(html)
  expect(text).not.toContain('</style><script>alert(1)</script>')
  expect(text).toContain('\\3c /style>\\3c script>alert(1)\\3c /script>')
  expect(value(readPortableHtml(html)).puzzle.entries).toEqual(library[0]!.puzzle.entries)
  const config = /<script id="crossword-config" type="application\/json">(.*?)<\/script>/.exec(text)![1]!
  expect(value(readConfiguration(config, library[0]!.puzzle)).chrome).toBe('puzzle')
  expect(readConfiguration(config.replace('"chrome":"puzzle"', '"chrome":"unknown"'), library[0]!.puzzle).ok).toBe(false)
})

test('embed import is inert and invalid puzzles fail before creating browser resources', async () => {
  // Bun has no DOM. Failure here must not access the host, document, or Blob URLs.
  const result = await mountPlayer({} as HTMLElement, new Uint8Array([1, 2, 3]))
  expect(result.ok).toBe(false)
})


test('embed validates progress and site options before touching the DOM', async () => {
  const puzzle = puzzleFiles[0]!
  const progress = newProgress(library[0]!.puzzle)
  progress.fills[0]!.letter = 'X'
  expect((await mountPlayer({} as HTMLElement, puzzle, { progress })).ok).toBe(false)
  expect((await mountPlayer({} as HTMLElement, puzzle, { site: { name: 'Site', homeUrl: 'javascript:alert(1)' } })).ok).toBe(false)
})

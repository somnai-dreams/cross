import { expect, test } from 'bun:test'
import { checksum, decodePuz, encodePuz, fromBase64, puzPayload, readPuzHtml, readPuzHtmlData, toBase64, writePuzHtml, type PuzData, type PuzHtmlSnapshot, type Result } from '../src'

const puzzle: PuzData = {
  title: 'Small things', author: 'Cross examples', copyright: 'Original synthetic fixture', notes: 'A little room to think.',
  grid: ['CAT', 'ORE', 'DEN'], across: ['Pet that purrs', 'Rock containing metal', 'A fox’s home'],
  down: ['Fish often battered', 'You ___ here', 'Five doubled'], circles: [0],
}
const assets = { css: '@import url("https://example.com/font"); body { color: black }', script: 'document.title = "ACROSS&DOWN";' }
function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.issue))
  return result.value
}
function snapshot(bytes = value(encodePuz(puzzle))): PuzHtmlSnapshot {
  return { puzzle: { version: 2, id: 'small-things', puz: toBase64(bytes), hints: Array<string>(6).fill('') }, progress: null }
}

test('native .puz preserves clue order, notes, copyright and circles', () => {
  const bytes = value(encodePuz(puzzle))
  expect(value(decodePuz(bytes))).toEqual(puzzle)
  expect(bytes.subarray(2, 13)).toEqual(new TextEncoder().encode('ACROSS&DOWN'))
  expect(value(encodePuz(value(decodePuz(bytes))))).toEqual(bytes)
})

test('independently written version 2.0 UTF-8 survives native HTML packaging', async () => {
  const bytes = new Uint8Array(await Bun.file(`${import.meta.dir}/../fixtures/native-utf8.puz`).arrayBuffer())
  const decoded = value(decodePuz(bytes))
  expect(decoded.title).toBe('Symbols → ♠')
  expect(decoded.across).toEqual(['Pet that purrs', 'Rock containing metal', 'Two hands of fingers →'])
  expect(decoded.down).toEqual(['Camping bed', 'You ___ here', 'Five doubled'])
  // A new 1.3 encoding cannot carry these characters. Preserve the native bytes.
  expect(encodePuz(decoded).ok).toBe(false)
  const html = value(writePuzHtml(snapshot(bytes), assets))
  expect(puzPayload(html)).toEqual(bytes)
  expect(value(decodePuz(fromBase64(value(readPuzHtml(html)).puzzle.puz)))).toEqual(decoded)
})

test('codec accepts asymmetric rectangles and 45x45 grids without player limits', () => {
  const rectangular: PuzData = { ...puzzle, grid: ['#BCD', 'EFGH', 'IJKL'], across: ['A1', 'A2', 'A3'], down: ['D1', 'D2', 'D3', 'D4'], circles: [] }
  expect(value(decodePuz(value(encodePuz(rectangular))))).toEqual(rectangular)
  const large: PuzData = { ...puzzle, grid: Array<string>(45).fill('A'.repeat(45)), across: Array<string>(45).fill('Across'), down: Array<string>(45).fill('Down'), circles: [] }
  expect(value(decodePuz(value(encodePuz(large))))).toEqual(large)
})

test('native checks reject damage and unsupported semantics before returning data', () => {
  const bytes = value(encodePuz(puzzle))
  for (const offset of [0, 2, 52, 75, bytes.length - 2]) {
    const corrupted = bytes.slice(); corrupted[offset] = corrupted[offset]! ^ 1
    expect(decodePuz(corrupted).ok).toBe(false)
  }
  for (const length of [0, 51, 65, bytes.length - 1]) expect(decodePuz(bytes.slice(0, length)).ok).toBe(false)
  const rebus = bytes.slice(); rebus.set(new TextEncoder().encode('GRBS'), bytes.length - 18)
  expect(decodePuz(rebus).ok).toBe(false)
  const locked = bytes.slice(); locked[50] = 4
  expect(decodePuz(locked).ok).toBe(false)
  expect(encodePuz({ ...puzzle, title: 'Arrow →' }).ok).toBe(false)
  expect(encodePuz({ ...puzzle, across: [] }).ok).toBe(false)
  expect(encodePuz({ ...puzzle, circles: [999] }).ok).toBe(false)
})

test('HTML and native paths read one payload; plain .puz export strips the wrapper', () => {
  const original = snapshot(), file = value(writePuzHtml(original, assets))
  expect(value(readPuzHtml(file))).toEqual(original)
  const binary = puzPayload(file)
  expect(binary).toEqual(fromBase64(original.puzzle.puz))
  expect(value(decodePuz(binary))).toEqual(puzzle)
  expect(binary.length).toBeLessThan(file.length)
  expect(new TextDecoder().decode(file).startsWith('<!doctype html>')).toBe(true)
  expect(new TextDecoder().decode(file)).not.toContain('@import')
  expect(value(writePuzHtml(value(readPuzHtml(file)), assets))).toEqual(file)
})

test('unknown native extension bytes survive the HTML envelope unchanged', () => {
  const plain = value(encodePuz(puzzle)), metadata = new Uint8Array([0, 255, 13, 10])
  const bytes = new Uint8Array(plain.length + 13)
  bytes.set(plain); bytes.set(new TextEncoder().encode('TEST'), plain.length)
  const view = new DataView(bytes.buffer)
  view.setUint16(plain.length + 4, metadata.length, true)
  view.setUint16(plain.length + 6, checksum(metadata), true)
  bytes.set(metadata, plain.length + 8)
  expect(value(decodePuz(bytes))).toEqual(puzzle)
  const file = value(writePuzHtml(snapshot(bytes), assets))
  expect(puzPayload(file)).toEqual(bytes)
  expect(fromBase64(value(readPuzHtml(file)).puzzle.puz)).toEqual(bytes)
})

test('HTML import is inert and rejects divergent binary and embedded copies', () => {
  const hostile = snapshot(value(encodePuz({ ...puzzle, title: '</script><script>alert(1)</script> ACROSS&DOWN' })))
  hostile.progress = { text: '</script><script>alert(2)</script>', pencil: [1] }
  const file = value(writePuzHtml(hostile, assets)), text = new TextDecoder().decode(file)
  expect(text.indexOf('alert(1)')).toBeGreaterThan(text.indexOf('<plaintext hidden'))
  expect(text).not.toContain('<script>alert(2)</script>')
  expect(value(readPuzHtml(file))).toEqual(hostile)
  const tail = value(encodePuz(puzzle)), altered = new Uint8Array(file.length - puzPayload(file).length + tail.length)
  altered.set(file.subarray(0, file.length - puzPayload(file).length)); altered.set(tail, altered.length - tail.length)
  const mismatch = readPuzHtml(altered)
  expect(mismatch.ok).toBe(false)
  if (!mismatch.ok) expect(mismatch.issue.code).toBe('mismatch')
})

test('envelope rejects unknown fields, malformed native data and mismatched hint counts', () => {
  const original = snapshot()
  for (const data of [
    { ...original, unknown: true },
    { ...original, puzzle: { ...original.puzzle, puz: 'not base64!' } },
    { ...original, puzzle: { ...original.puzzle, hints: [] } },
    { ...original, puzzle: { ...original.puzzle, id: '' } },
  ]) expect(readPuzHtmlData(JSON.stringify(data)).ok).toBe(false)
  expect(readPuzHtmlData('{"puzzle":0,"puzzle":1,"progress":null}').ok).toBe(false)
  expect(readPuzHtmlData('{"puzzle":0,"progress":null}').ok).toBe(false)
})

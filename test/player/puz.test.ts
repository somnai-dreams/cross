import { expect, test } from 'bun:test'
import { library } from './fixtures'
import { importPuzzle, parsePuz } from '../../src/player/puz'
import { checksum, encodePuz } from '../../src/player/puz-format'

function fixture(extension = ''): ArrayBuffer {
  const p = structuredClone(library[0]!.puzzle)
  if (extension !== '') {
    const cell = p.cells[1]!
    if (cell.kind !== 'letter') throw new Error('Expected a letter cell')
    cell.circled = true
  }
  const encoded = encodePuz(p)
  if (!encoded.ok) throw new Error(encoded.error)
  if (extension !== '') encoded.value.set(new TextEncoder().encode(extension), encoded.value.length - 34)
  return encoded.value.buffer
}

test('imports standard .puz clue order and the original solution without using the in-file player fill', async () => {
  const result = await parsePuz(fixture())
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error)
  expect(result.value.entries).toEqual(library[0]!.puzzle.entries.map(entry => ({ ...entry, clue: { text: entry.clue.text, hint: '' } })))
  expect(result.value.cells).toEqual(library[0]!.puzzle.cells)
})

test('supports circled cells and explicitly rejects rebuses and locked files', async () => {
  const circled = await parsePuz(fixture('GEXT'))
  expect(circled.ok).toBe(true)
  if (!circled.ok) throw new Error(circled.error)
  expect(circled.value.cells[1]).toEqual({ kind: 'letter', solution: 'A', circled: true })
  expect((await parsePuz(fixture('GRBS'))).ok).toBe(false)
  const locked = fixture(); new Uint8Array(locked)[50] = 4
  expect((await parsePuz(locked)).ok).toBe(false)
})

test('rejects truncation, wrong file types, and corrupt headers', async () => {
  const complete = fixture()
  for (const length of [0, 13, 51, 101, complete.byteLength - 1]) expect((await parsePuz(complete.slice(0, length))).ok).toBe(false)
  const wrong = fixture(); new Uint8Array(wrong)[2] = 0
  expect((await parsePuz(wrong)).ok).toBe(false)
  expect((await importPuzzle(fixture(), 'not-a-puzzle.txt')).ok).toBe(false)
})


test('rejects corrupted solution, text, and extension checksums', async () => {
  for (const position of [52, 103]) {
    const bytes = new Uint8Array(fixture()); bytes[position] = bytes[position]! ^ 1
    expect((await parsePuz(bytes.buffer)).ok).toBe(false)
  }
  const bytes = new Uint8Array(fixture('GEXT')); bytes[bytes.length - 2] = 128
  expect((await parsePuz(bytes.buffer)).ok).toBe(false)
})

test('preserves unknown extension bytes through import and re-export', async () => {
  const original = new Uint8Array(fixture())
  const bytes = new Uint8Array(original.length + 13)
  bytes.set(original); bytes.set(new TextEncoder().encode('TEST'), original.length)
  const data = new DataView(bytes.buffer)
  data.setUint16(original.length + 4, 4, true)
  const metadata = new Uint8Array([0, 255, 13, 10])
  bytes.set(metadata, original.length + 8)
  data.setUint16(original.length + 6, checksum(metadata), true)
  const parsed = await parsePuz(bytes.buffer)
  if (!parsed.ok) throw new Error(parsed.error)
  const output = encodePuz(parsed.value)
  if (!output.ok) throw new Error(output.error)
  expect(output.value).toEqual(bytes)
})

// Optional review probe, not a runtime dependency or a general parser benchmark.
// Run with Bun and a checkout of the exact candidate commit below.
import { expect } from 'bun:test'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const candidate = Bun.argv[2]
const fixtures = Bun.argv[3] ?? resolve(import.meta.dir, '../../fixtures')
if (candidate === undefined) throw new Error('Usage: bun docs/reviews/xword-parser.mjs /path/to/xword-parser [fixtures-directory]')
const commit = 'f9f1168dfb46d554807c859062ae624a45bb8a0d'
const head = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: candidate })
expect(head.exitCode).toBe(0)
expect(head.stdout.toString().trim()).toBe(commit)
const { parseIpuz, convertIpuzToUnified } = await import(pathToFileURL(resolve(candidate, 'src/ipuz.ts')).href)
const { validatePuzzle } = await import(pathToFileURL(resolve(candidate, 'src/validate.ts')).href)
const results = []

async function probe(name) {
  const source = await Bun.file(resolve(fixtures, `${name}.ipuz`)).text()
  const raw = JSON.parse(source)
  const parsed = parseIpuz(source)
  const unified = validatePuzzle(convertIpuzToUnified(parsed))
  return { raw, parsed, unified }
}

for (const name of ['ordinary', 'circled', 'rebus']) {
  const { raw, unified } = await probe(name)
  expect(unified.grid.width).toBe(raw.dimensions.width)
  expect(unified.grid.height).toBe(raw.dimensions.height)
  expect(unified.grid.cells.map(row => row.map(cell => cell.solution))).toEqual(raw.solution)
  expect(unified.clues.across.map(clue => [clue.number, clue.text])).toEqual(raw.clues.Across)
  expect(unified.clues.down.map(clue => [clue.number, clue.text])).toEqual(raw.clues.Down)
  if (name === 'circled') expect(unified.grid.cells[0][0].isCircled).toBe(true)
  results.push({ fixture: name, observation: 'Dimensions, cell answers and clue tuples preserved; circle flag preserved when present.' })
}

{
  const { parsed, unified } = await probe('authored-labels')
  expect(parsed.puzzle[0][0].number).toBeUndefined()
  expect(parsed.puzzle[0][0].value).toBe('A')
  expect(unified.grid.cells[0][0].number).toBeUndefined()
  expect(unified.clues.across.length + unified.clues.down.length).toBe(0)
  results.push({ fixture: 'authored-labels', observation: 'Primitive A label becomes a value in the raw parser. Unified model omits labels and all six clues; validation accepts it.' })
}
{
  const { raw, parsed, unified } = await probe('linked')
  expect(parsed.clues.Across[0].continued).toEqual(raw.clues.Across[0].continued)
  for (const field of ['label', 'enumeration', 'hints']) expect(Object.hasOwn(parsed.clues.Across[0], field)).toBe(false)
  expect(Object.keys(unified.clues.across[0]).sort()).toEqual(['number', 'text'])
  results.push({ fixture: 'linked', observation: 'Raw parser omits label, enumeration and hints; retains continued. Unified clue contains number and text only.' })
}
{
  const { parsed, unified } = await probe('barred')
  expect(parsed.puzzle[0][1].style.barred).toBe('R')
  expect(unified.grid.cells[0][1].additionalProperties.style.barred).toBe('R')
  results.push({ fixture: 'barred', observation: 'Bar retained as additionalProperties.style.barred; geometry interpretation remains with the consumer.' })
}
{
  const { raw, parsed, unified } = await probe('in-progress')
  expect(parsed.saved).toEqual(raw.saved)
  expect(JSON.stringify(unified).includes('"saved"')).toBe(false)
  expect(unified.additionalProperties.extensions['io.github.somnai-dreams.cross:attempt']).toEqual(raw['io.github.somnai-dreams.cross:attempt'])
  results.push({ fixture: 'in-progress', observation: 'Raw parser retains saved fill; unified result omits it, while retaining the attempt extension as opaque metadata.' })
}
{
  const { raw, parsed, unified } = await probe('legacy-checksum')
  expect(parsed.checksum).toEqual(raw.checksum)
  expect(JSON.stringify(unified).includes('"checksum"')).toBe(false)
  results.push({ fixture: 'legacy-checksum', observation: 'Raw parser retains checksum; unified result omits it.' })
}
console.log(JSON.stringify({
  source: 'https://github.com/mjkoo/xword-parser', commit,
  crossFixturesCommit: 'f4cab1d02e7573c9bf8f9b732b55436ea665311f',
  runtime: `Bun ${Bun.version}`,
  pipeline: 'parseIpuz -> convertIpuzToUnified -> validatePuzzle; direct source imports, no package installation or other formats tested',
  results,
}, null, 2))

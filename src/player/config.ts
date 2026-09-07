import { parseJson } from '../json'
import { isRecord, parsePuzzle, puzzleIdentity, type Puzzle, type Result } from './puzzle'
import type { LibraryEntry } from './location'

export type PlayerConfiguration = {
  brand: string
  storageKey: string
  mode: 'standalone' | 'collection'
  library: LibraryEntry[]
}

/** The initial puzzle lives in the native envelope. Collection metadata is optional. */
export function readConfiguration(text: string | null, initial: Puzzle): Result<PlayerConfiguration> {
  if (text === null) return { ok: true, value: { brand: 'Cross', storageKey: 'cross', mode: 'standalone', library: [] } }
  const parsed = parseJson(text)
  if (!parsed.ok) return { ok: false, error: parsed.issue.message }
  const raw = parsed.value
  if (!isRecord(raw) || raw['version'] !== 1 || typeof raw['brand'] !== 'string' || raw['brand'].trim() === '' ||
      typeof raw['storageKey'] !== 'string' || raw['storageKey'].length === 0 || raw['mode'] !== 'collection' || !Array.isArray(raw['library'])) return { ok: false, error: 'Invalid player collection configuration.' }
  if (Object.keys(raw).some(key => !['version', 'brand', 'storageKey', 'mode', 'library'].includes(key))) return { ok: false, error: 'Unknown player configuration field.' }
  const library: LibraryEntry[] = []
  for (const item of raw['library'] as unknown[]) {
    if (!isRecord(item) || typeof item['slug'] !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item['slug']) ||
        Object.keys(item).some(key => key !== 'slug' && key !== 'puzzle')) return { ok: false, error: 'Each collection entry needs a URL slug and puzzle.' }
    const puzzle = parsePuzzle(item['puzzle'])
    if (!puzzle.ok) return puzzle
    if (library.some(entry => entry.slug === item['slug'] || entry.puzzle.id === puzzle.value.id)) return { ok: false, error: 'Collection slugs and puzzle ids must be unique.' }
    library.push({ slug: item['slug'], puzzle: puzzle.value })
  }
  const selected = library.find(entry => entry.puzzle.id === initial.id)
  if (selected === undefined) return { ok: false, error: 'The initial puzzle must be in the collection.' }
  if (puzzleIdentity(selected.puzzle) !== puzzleIdentity(initial)) return { ok: false, error: 'The collection and embedded initial puzzle do not match.' }
  return { ok: true, value: { brand: raw['brand'], storageKey: raw['storageKey'], mode: 'collection', library } }
}

import { parsePuzzle, type Puzzle, type Result } from './puzzle'
import { puzPayload, toBase64 } from './puz-format'
import { readPortableHtml, type PortablePuzzle } from './portable'

export async function importPuzzle(buffer: ArrayBuffer, filename: string): Promise<Result<PortablePuzzle>> {
  const extension = filename.toLowerCase().split('.').at(-1)
  switch (extension) {
    case 'html': case 'htm': return readPortableHtml(new Uint8Array(buffer))
    case 'puz': {
      const parsed = await parsePuz(buffer)
      return parsed.ok ? { ok: true, value: { puzzle: parsed.value, progress: null } } : parsed
    }
    case 'json':
      try {
        const raw: unknown = JSON.parse(new TextDecoder().decode(buffer))
        const parsed = parsePuzzle(raw)
        return parsed.ok ? { ok: true, value: { puzzle: parsed.value, progress: null } } : parsed
      }
      catch { return { ok: false, error: 'This is not a valid crossword JSON file.' } }
    default: return { ok: false, error: 'Choose a .puz, Cross HTML, or crossword JSON file.' }
  }
}

export async function parsePuz(buffer: ArrayBuffer): Promise<Result<Puzzle>> {
  const bytes = puzPayload(new Uint8Array(buffer))
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  const id = `puz-${[...digest].map(byte => byte.toString(16).padStart(2, '0')).join('')}`
  return parsePuzzle({ version: 2, id, puz: toBase64(bytes) })
}

import { fail, type Result } from './model'
import { encodePuz, type PuzData } from './puz'
import type { PuzHtmlSnapshot } from './portable'
import { parsePuz } from './player/puz'
import { parsePuzzle, type AuthoredPuzzle, type Puzzle } from './player/puzzle'

export type HtmlPuzzle = Uint8Array | ArrayBuffer | AuthoredPuzzle | PuzData | PuzHtmlSnapshot['puzzle']

export async function readInput(input: HtmlPuzzle): Promise<Result<Puzzle>> {
  if (input instanceof Uint8Array || input instanceof ArrayBuffer) {
    const parsed = await parsePuz(new Uint8Array(input).buffer)
    return parsed.ok ? parsed : fail('unsupported', '$.puzzle', parsed.error)
  }
  if ('version' in input) {
    const parsed = parsePuzzle(input)
    return parsed.ok ? parsed : fail('invalid-data', '$.puzzle', parsed.error)
  }
  const encoded = encodePuz(input)
  return encoded.ok ? readInput(encoded.value) : encoded
}

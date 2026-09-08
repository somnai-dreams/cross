import { playerAssets } from '../generated/player'
import { fail, type Result } from './model'
import { encodePuz, toBase64, type PuzData } from './puz'
import { writePuzHtml, type PuzHtmlSnapshot } from './portable'
import { parsePuz } from './player/puz'
import { parsePuzzle, puzzleFile, type AuthoredPuzzle, type Puzzle } from './player/puzzle'
import { encodePuz as encodePlayerPuz } from './player/puz-format'
import { parseProgress, progressFile, type Progress } from './player/engine'
import { readConfiguration } from './player/config'

export type HtmlPuzzle = Uint8Array | ArrayBuffer | AuthoredPuzzle | PuzData | PuzHtmlSnapshot['puzzle']
export type HtmlOptions = { progress?: Progress; site?: { name: string; homeUrl: string } }
export type CollectionOptions = {
  puzzles: { slug: string; puzzle: HtmlPuzzle }[]
  defaultSlug: string
  title?: string
  storageKey?: string
}

async function readInput(input: HtmlPuzzle): Promise<Result<Puzzle>> {
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

function packagePuzzle(puzzle: Puzzle, options: HtmlOptions, configuration?: Parameters<typeof writePuzHtml>[2]): Result<Uint8Array<ArrayBuffer>> {
  const native = encodePlayerPuz(puzzle)
  if (!native.ok) return fail('unsupported', '$.puzzle', native.error)
  const progress = options.progress === undefined ? null : progressFile(puzzle, options.progress)
  if (progress !== null) {
    const checked = parseProgress(progress, puzzle)
    if (!checked.ok) return fail('invalid-data', '$.progress', checked.error)
  }
  return writePuzHtml({
    puzzle: { version: 2, id: puzzle.id, puz: toBase64(native.value), hints: puzzle.entries.map(entry => entry.clue.hint) }, progress,
  }, playerAssets, { title: puzzle.title, ...configuration })
}

/** Produce a complete offline crossword with the included desktop/mobile UI. */
export async function createHtml(input: HtmlPuzzle, options: HtmlOptions = {}): Promise<Result<Uint8Array<ArrayBuffer>>> {
  const parsed = await readInput(input)
  if (!parsed.ok) return parsed
  if (options.site === undefined) return packagePuzzle(parsed.value, options)
  const configuration = { version: 1, brand: options.site.name, homeUrl: options.site.homeUrl, storageKey: 'cross', mode: 'standalone', library: [] }
  const checked = readConfiguration(JSON.stringify(configuration), parsed.value)
  return checked.ok ? packagePuzzle(parsed.value, options, { configuration }) : fail('invalid-data', '$.site', checked.error)
}

/** The same included UI, with an optional collection and stable ?puzzle= links. */
export async function createCollectionHtml(options: CollectionOptions): Promise<Result<Uint8Array<ArrayBuffer>>> {
  const library: { slug: string; puzzle: ReturnType<typeof puzzleFile> }[] = []
  let initial: Puzzle | null = null
  for (const item of options.puzzles) {
    const parsed = await readInput(item.puzzle)
    if (!parsed.ok) return parsed
    library.push({ slug: item.slug, puzzle: puzzleFile(parsed.value) })
    if (item.slug === options.defaultSlug) initial = parsed.value
  }
  if (initial === null) return fail('invalid-data', '$.defaultSlug', 'Choose a default puzzle from the collection.')
  const configuration = { version: 1, brand: options.title ?? 'Cross', storageKey: options.storageKey ?? 'cross', mode: 'collection', library }
  const checked = readConfiguration(JSON.stringify(configuration), initial)
  if (!checked.ok) return fail('invalid-data', '$.collection', checked.error)
  return packagePuzzle(initial, {}, { configuration })
}

import { playerAssetsFor } from './player-assets'
import { readInput, type HtmlPuzzle } from './player-input'
import { fail, type Result } from './model'
import { toBase64 } from './puz'
import { writePuzHtml } from './portable'
import { puzzleFile, type Puzzle } from './player/puzzle'
import { encodePuz as encodePlayerPuz } from './player/puz-format'
import { parseProgress, progressFile, type Progress } from './player/engine'
import { readConfiguration } from './player/config'

export type { HtmlPuzzle } from './player-input'

export type HtmlOptions = {
  progress?: Progress
  site?: { name: string; homeUrl: string }
  /** Trusted publisher CSS, appended after the included styles and carried through HTML downloads. */
  css?: string
  chrome?: 'full' | 'puzzle'
}
export type CollectionOptions = {
  puzzles: { slug: string; puzzle: HtmlPuzzle }[]
  defaultSlug: string
  title?: string
  storageKey?: string
  css?: string
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
  }, playerAssetsFor(options.css), { title: puzzle.title, ...configuration })
}

/** Produce a complete offline crossword with the included desktop/mobile UI. */
export async function createHtml(input: HtmlPuzzle, options: HtmlOptions = {}): Promise<Result<Uint8Array<ArrayBuffer>>> {
  const parsed = await readInput(input)
  if (!parsed.ok) return parsed
  if (options.site === undefined && options.chrome === undefined) return packagePuzzle(parsed.value, options)
  const configuration = { version: 1, brand: options.site?.name ?? 'Cross', homeUrl: options.site?.homeUrl ?? null, storageKey: 'cross', mode: 'standalone', library: [], chrome: options.chrome ?? 'full' }
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
  return packagePuzzle(initial, { css: options.css ?? '' }, { configuration })
}

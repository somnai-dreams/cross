import type { HtmlOptions, HtmlPuzzle } from './html'
import { fail, type Result } from './model'
import { readInput } from './player-input'
import { playerAssetsFor, playerStyles } from './player-assets'
import { readConfiguration } from './player/config'
import { parseProgress, progressFile } from './player/engine'
import { createPlayer } from './player/mount'

export type MountedPlayer = {
  /** A normal DOM root. Host CSS can target its data-cross-part hooks. */
  element: HTMLDivElement
  /** Save queued input, release listeners and timers, and remove this root. */
  destroy: () => void
}

/** Mount the included UI directly. Importing this module touches no DOM. */
export async function mountPlayer(host: HTMLElement, input: HtmlPuzzle, options: HtmlOptions = {}): Promise<Result<MountedPlayer>> {
  const parsed = await readInput(input)
  if (!parsed.ok) return parsed
  const puzzle = parsed.value
  const configured = readConfiguration(JSON.stringify({ version: 1, brand: options.site?.name ?? 'Cross',
    homeUrl: options.site?.homeUrl ?? null, storageKey: 'cross', mode: 'standalone', library: [], chrome: options.chrome ?? 'puzzle',
  }), puzzle)
  if (!configured.ok) return fail('invalid-data', '$.site', configured.error)
  const snapshot = options.progress === undefined ? null : parseProgress(progressFile(puzzle, options.progress), puzzle)
  if (snapshot !== null && !snapshot.ok) return fail('invalid-data', '$.progress', snapshot.error)
  const assets = playerAssetsFor(options.css)
  const player = createPlayer(host, { puzzle, progress: snapshot === null ? null : snapshot.value }, configured.value, {
    assets: () => assets, css: playerStyles(options.css), titleChanged: () => {},
  })
  return { ok: true, value: { element: player.element, destroy: player.destroy } }
}

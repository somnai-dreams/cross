import { playerAssets } from '../generated/player'
import type { PlayerAssets } from './portable'

/** Rules use :scope for the player root; callers choose the scope boundary. */
export function playerStyles(css: string = ''): string {
  return `${playerAssets.css}\n${css}`
}

export function playerAssetsFor(css: string = ''): PlayerAssets {
  return { script: playerAssets.script, css: `@scope (.cross-player) to (.cross-player) { ${playerStyles(css)} }` }
}

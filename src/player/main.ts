import { readConfiguration } from './config'
import { createPlayer } from './mount'
import { parsePortable } from './portable'
import { fromBase64 } from './puz-format'
import { registerPlayerTools } from './webmcp'

const host = document.querySelector('#app')
const embedded = document.querySelector('#crossword-data')
const script = document.querySelector<HTMLScriptElement>('#player-code')
const style = document.querySelector<HTMLStyleElement>('#player-style')
if (!(host instanceof HTMLElement) || embedded === null || script === null || style === null) throw new Error('Missing embedded player data or assets')
const portable = parsePortable(embedded.textContent)
if (!portable.ok) { host.textContent = portable.error; throw new Error(portable.error) }
const configured = readConfiguration(document.querySelector('#crossword-config')?.textContent ?? null, portable.value.puzzle)
if (!configured.ok) { host.textContent = configured.error; throw new Error(configured.error) }
const prefix = 'data:text/javascript;base64,'
if (!script.src.startsWith(prefix)) throw new Error('Missing embedded player code')
// Only the standalone document adapter owns page presentation and browser tools.
document.body.style.margin = '0'
host.style.height = '100dvh'
const player = createPlayer(host, portable.value, configured.value, {
  css: null,
  assets: () => ({ css: style.textContent, script: new TextDecoder().decode(fromBase64(script.src.slice(prefix.length))) }),
  titleChanged: title => { document.title = title },
})
registerPlayerTools(player.request)

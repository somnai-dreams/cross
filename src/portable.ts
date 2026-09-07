import { object, parseJson, type Json } from './json'
import { fail, type Result } from './model'
import { decodePuz, fromBase64, puzPayload, toBase64 } from './puz'

export type PlayerAssets = { css: string; script: string }
export type PuzHtmlSnapshot = {
  puzzle: { version: 2; id: string; puz: string; hints: string[] }
  // The renderer owns the interpretation and validation of its progress schema.
  // This is separate from Document.attempt and is never used in answer-free export.
  progress: Json
}

const marker = '<script id="crossword-data" type="application/json">'

/** Validate the native puzzle envelope; leave renderer-specific progress to its owner. */
export function readPuzHtmlData(text: string): Result<PuzHtmlSnapshot> {
  const parsed = parseJson(text)
  if (!parsed.ok) return parsed
  const raw = parsed.value
  if (!object(raw) || !object(raw['puzzle']) || raw['progress'] === undefined) return fail('invalid-data', '$', 'Expected a puzzle and progress snapshot.')
  if (Object.keys(raw).some(key => key !== 'puzzle' && key !== 'progress')) return fail('unsupported', '$', 'Unknown portable envelope field.')
  const puzzle = raw['puzzle']
  if (Object.keys(puzzle).some(key => !['version', 'id', 'puz', 'hints'].includes(key))) return fail('unsupported', '$.puzzle', 'Unknown portable puzzle field.')
  const { version, id, puz } = puzzle
  if (version !== 2 || typeof id !== 'string' || id.length === 0 || id.length > 160 || typeof puz !== 'string') return fail('invalid-data', '$.puzzle', 'Expected a version 2 native puzzle with an id and base64 .puz bytes.')
  let bytes: Uint8Array<ArrayBuffer>
  try { bytes = fromBase64(puz) } catch { return fail('invalid-data', '$.puzzle.puz', 'Invalid base64 .puz bytes.') }
  const decoded = decodePuz(bytes)
  if (!decoded.ok) return decoded
  const hints = puzzle['hints'] ?? Array<string>(decoded.value.across.length + decoded.value.down.length).fill('')
  if (!Array.isArray(hints) || hints.length !== decoded.value.across.length + decoded.value.down.length) return fail('invalid-data', '$.puzzle.hints', 'Hints must match the native clue count.')
  const checkedHints: string[] = []
  for (const hint of hints) {
    if (typeof hint !== 'string') return fail('invalid-data', '$.puzzle.hints', 'Hints must be text.')
    checkedHints.push(hint)
  }
  return { ok: true, value: { puzzle: { version: 2, id, puz: toBase64(bytes), hints: checkedHints }, progress: raw['progress'] } }
}

/** Read only the inert data block. Imported player scripts are never executed. */
export function readPuzHtml(bytes: Uint8Array<ArrayBuffer>): Result<PuzHtmlSnapshot> {
  const text = new TextDecoder().decode(bytes)
  const start = text.indexOf(marker), end = text.indexOf('</script>', start + marker.length)
  if (start === -1 || end === -1) return fail('invalid-data', '$', 'This HTML file has no Cross native puzzle envelope.')
  const parsed = readPuzHtmlData(text.slice(start + marker.length, end))
  if (!parsed.ok) return parsed
  const encoded = fromBase64(parsed.value.puzzle.puz), tail = puzPayload(bytes)
  if (encoded.length !== tail.length || !encoded.every((byte, i) => tail[i] === byte)) return fail('mismatch', '$.puzzle.puz', 'The HTML and .puz copies do not match.')
  return parsed
}

/** Package a trusted, bundled player and one native puzzle as an experimental polyglot. */
export function writePuzHtml(snapshot: PuzHtmlSnapshot, assets: PlayerAssets): Result<Uint8Array<ArrayBuffer>> {
  const checked = readPuzHtmlData(JSON.stringify(snapshot))
  if (!checked.ok) return checked
  const binary = fromBase64(checked.value.puzzle.puz)
  const json = JSON.stringify(checked.value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026')
  const script = toBase64(new TextEncoder().encode(assets.script))
  const css = assets.css.replace(/@import[^;]+;/g, '')
  const prefix = new TextEncoder().encode(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#f8f9fc"><title>Crossword</title><style id="player-style">${css}</style></head>
<body><div id="app"></div>${marker}${json}</script><script id="player-code" type="module" src="data:text/javascript;base64,${script}"></script>
<plaintext hidden aria-hidden="true">`)
  const output = new Uint8Array(prefix.length + binary.length)
  output.set(prefix); output.set(binary, prefix.length)
  return { ok: true, value: output }
}

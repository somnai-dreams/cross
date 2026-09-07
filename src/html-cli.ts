#!/usr/bin/env bun
import { createHtml } from './html'

const [input, output] = process.argv.slice(2)
if (input === undefined || output === undefined) {
  console.error('Usage: cross-html puzzle.puz puzzle.html')
  process.exit(1)
}
const html = await createHtml(new Uint8Array(await Bun.file(input).arrayBuffer()))
if (!html.ok) {
  console.error(`${html.issue.path}: ${html.issue.message}`)
  process.exit(1)
}
await Bun.write(output, html.value)
console.log(`Wrote ${output} (${html.value.length} bytes, including the player).`)

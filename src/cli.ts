import { answerFree, readIpuzBytes, writeIpuz } from './ipuz'
import { entries } from './model'
import { revision } from './verification'

const [mode = 'fixtures', path] = Bun.argv.slice(2)
switch (mode) {
  case 'fixtures': {
    const directory = `${import.meta.dir}/../fixtures`
    const files = Array.from(new Bun.Glob('*.ipuz').scanSync(directory)).sort()
    for (const file of files) {
      const parsed = await readIpuzBytes(new Uint8Array(await Bun.file(`${directory}/${file}`).arrayBuffer()))
      if (!parsed.ok) { console.error(file, parsed.issue); process.exit(1) }
      const written = await writeIpuz(parsed.value)
      if (!written.ok) { console.error(file, written.issue); process.exit(1) }
      console.log(`${file}: ${entries(parsed.value.puzzle).length} entries; ${await revision(parsed.value.puzzle)}`)
    }
    break
  }
  case 'answer-free': {
    if (path === undefined) { console.error('Usage: bun src/cli.ts answer-free puzzle.ipuz > public.ipuz'); process.exit(1) }
    const input = Bun.file(path)
    if (!await input.exists()) { console.error(`File does not exist: ${path}`); process.exit(1) }
    const parsed = await readIpuzBytes(new Uint8Array(await input.arrayBuffer()))
    if (!parsed.ok) { console.error(parsed.issue); process.exit(1) }
    const output = await answerFree(parsed.value)
    if (!output.ok) { console.error(output.issue); process.exit(1) }
    console.log(output.value)
    break
  }
  default: console.error(`Unknown command: ${mode}`); process.exit(1)
}

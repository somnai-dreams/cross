# Cross

Cross is a TypeScript library for portable crossword files. It packages a puzzle and a bundled player into a self-contained HTML file, reads and writes native `.puz`, and includes an experimental HTML/`.puz` polyglot: one file that a browser can play and a signature-scanning `.puz` reader can import.

The library also provides typed [ipuz](https://www.puzzazz.com/ipuz) documents, separate public puzzles and answer keys, revision-bound progress, and answer-free whole-grid verification. Applications supply their interface and persistence. The runtime has no dependencies.

## Why a separate library?

A constructor or custom player should be able to offer portable files without owning binary checksums, HTML packaging, and document conversion rules. Cross extracts those responsibilities from an existing player so other applications can use them directly.

Cross does not introduce a `.cross` encoding. Native `.puz` remains the compatibility payload for the playable HTML experiment; ipuz is the richer document interchange format. These have separate typed adapters today. A metadata-preserving conversion between them is still needed.

| Requirement | Existing option |
| --- | --- |
| A ready-made player with self-contained HTML distribution | [Exolve](https://github.com/viresh-ratnakar/exolve) |
| TypeScript imports across PUZ, ipuz, JPZ, and XD | [xword-parser](https://github.com/mjkoo/xword-parser) |
| Puzzle manipulation with a C API and GObject bindings | [libipuz](https://libipuz.org/libipuz-1.0/intro.html) |
| Your own player, reusable HTML/`.puz` packaging, and explicit document publication rules | Evaluate Cross against your puzzles |

HTML portability alone is not new. Cross's intended value is a small reusable file library that leaves the application in control of its UI and data. The [comparison and reuse decision](docs/alternatives.md) records the evidence and the workflow still needed to establish that value.

## Current scope

- Native `.puz` decoding and encoding, including checksums and circles.
- Playable HTML packaging from a native puzzle and caller-supplied bundled script/CSS.
- Inert HTML data import, with equality checks between the embedded and binary puzzle copies.
- Typed ipuz parsing, writing, revision identity, attempts, and answer-free verification.

An existing crossword player consumes both the native codec and HTML packager, including its progress downloads. Its build also uses the ipuz export path. Cross does not yet ship a default renderer, migrate that player's live state to the ipuz model, or convert imported `.puz` metadata to ipuz.

The ordinary `.puz` download contains only the native payload. The HTML download contains the player, JSON data, and the same native bytes at the end; they are different files. The polyglot is experimental: readers that require the header at byte 2 need the ordinary `.puz` export. Native `.puz` and this HTML edition contain the answers. Answer-free publication currently applies to ipuz only.

## Use the package

Install from a specific Git commit for reproducible consumption:

```sh
bun add '@somnai-dreams/cross@github:somnai-dreams/cross#<commit-sha>'
```

Package an existing native puzzle with your player bundle:

```ts
import { decodePuz, toBase64, writePuzHtml } from '@somnai-dreams/cross'

const bytes = new Uint8Array(await Bun.file('puzzle.puz').arrayBuffer())
const parsed = decodePuz(bytes)
if (!parsed.ok) {
  console.error(parsed.issue.message)
} else {
  const [script, css] = await Promise.all([
    Bun.file('bundled-player.js').text(),
    Bun.file('player.css').text(),
  ])
  const html = writePuzHtml({
    puzzle: {
      version: 2, id: 'my-puzzle', puz: toBase64(bytes),
      hints: Array<string>(parsed.value.across.length + parsed.value.down.length).fill(''),
    },
    progress: null,
  }, { script, css })
  if (html.ok) await Bun.write('puzzle.html', html.value)
  else console.error(html.issue.message)
}
```

The supplied script mounts into `#app` and reads `#crossword-data` with `readPuzHtmlData`. It must implement the player and include its dependencies; arbitrary script/CSS is not automatically made offline. See the [portable file contract](docs/portable.md) for renderer startup, re-export, progress, and native format limits.

To publish an answer-free ipuz:

```ts
import { answerFree, readIpuzBytes } from '@somnai-dreams/cross'

const parsed = await readIpuzBytes(new Uint8Array(await Bun.file('puzzle.ipuz').arrayBuffer()))
if (!parsed.ok) {
  console.error(parsed.issue.path, parsed.issue.message)
} else {
  const exported = await answerFree(parsed.value)
  if (exported.ok) await Bun.write('public.ipuz', exported.value)
  else console.error(exported.issue.path, exported.issue.message)
}
```

The package exports TypeScript source for Bun and TypeScript-capable bundlers. Parsing returns a complete supported value or a structured issue. [SPEC.md](SPEC.md) defines the experimental ipuz profile and exact verification bytes. The answer-free check permits offline guesses; it provides neither reveal nor proof of an unaided solve.

## Develop

```sh
bun install --frozen-lockfile
bun run check
bun test
bun run fixtures
bun src/cli.ts answer-free fixtures/ordinary.ipuz > /tmp/public.ipuz
```

Checks use TypeScript 7 and type-aware Oxlint. CI runs the same commands. No sibling checkout is needed.

## Fixtures and license

The eleven ipuz documents are synthetic conformance cases, including deliberately altered answers. `fixtures/vectors.json` freezes hash preimages and digests independently constructed with Python `hashlib`. `fixtures/native-utf8.puz` is a synthetic version-2.0 puzzle written by puzpy 0.6.0; [its provenance and the native compatibility evidence](docs/portable.md#verification-evidence) are recorded separately.

Code, the Cross specification, and the original synthetic fixtures are MIT licensed. Referenced incumbent specifications retain their own terms. ipuz is a trademark of Puzzazz, Inc., used with permission.

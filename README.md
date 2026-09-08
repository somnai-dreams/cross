# Cross

Give Cross a crossword. Get one HTML file with the complete player inside.

Keyboard and touch input, desktop clue columns, a mobile keyboard, hints, pencil marks, check/reveal, a timer, saved progress, and file import/export are included. There is no renderer to write, asset bundle to supply, CDN, framework, or runtime dependency.

```ts
import { createHtml } from '@somnai-dreams/cross/html'

const puzzle = new Uint8Array(await Bun.file('puzzle.puz').arrayBuffer())
const html = await createHtml(puzzle)
if (!html.ok) throw new Error(html.issue.message)
await Bun.write('puzzle.html', html.value)
```

Open the result in a browser to solve. The file can load another puzzle and save another complete playable file without fetching anything. Its native `.puz` payload is also recoverable by compatible signature-scanning readers; the UI offers an ordinary `.puz` download for other applications.

## Install

The package currently ships through this public Git repository. Pin a commit:

```sh
bun add '@somnai-dreams/cross@github:somnai-dreams/cross#<commit-sha>'
bun x cross-html puzzle.puz puzzle.html
```

It exports TypeScript source for Bun and TypeScript-capable bundlers. The included renderer is already compiled and checked into the package. Consumers do not build it, install development dependencies, or need a sibling checkout.

## Small, with the UI optional

The included player script and minified CSS total about **81 KB raw / 26 KB gzipped**. A complete ordinary puzzle file is about **100–104 KB raw**, including the base64 player and both native puzzle copies. Gzip size is a transfer measurement, not the size of a downloaded HTML file. CI checks the bundle stays below 110 KB raw and 30 KB gzipped and that the committed bundle matches its source.

| Entry point | Provides |
| --- | --- |
| `@somnai-dreams/cross/html` | `createHtml` with the complete UI, plus `createCollectionHtml` for a puzzle collection |
| `@somnai-dreams/cross` | Headless `.puz` and ipuz codecs, document identity, and answer-free verification; no UI bundle or DOM initialization |
| `@somnai-dreams/cross/player` | Player data parsing, pure solving/navigation/progress operations, and file import; no DOM initialization |
| `@somnai-dreams/cross/embed` | `mountPlayer` with the included UI in an isolated iframe, custom CSS, and explicit cleanup |

The package contains the player source as well as its compiled bundle. Its state and DOM ownership follow the same engineering rules as the file library: parse inputs at their boundary, keep solving state serializable, process input in one ordered render loop, and keep cached DOM nodes outside that state. The [architecture and limits](docs/player.md) describe the actual implementation.

## Use the player in your own site

```ts
import { mountPlayer } from '@somnai-dreams/cross/embed'

const mounted = await mountPlayer(hostElement, puzzle, {
  site: { name: 'My crosswords', homeUrl: 'https://example.com/' },
  css: `
    :root { --accent: #87512b; --word: #f6e7d8; --font: Arial, sans-serif; }
    [data-cross-part="clue"] { border-radius: 0; }
  `,
})
if (!mounted.ok) throw new Error(mounted.issue.message)

// When the host view is removed:
mounted.value.destroy()
```

Give the host an explicit height, such as `height: 80svh; min-height: 600px`. The frame fills it. Each player gets its own document, so styles and input handling stay inside the frame. The default embedded view omits the site header; pass `chrome: 'full'` to include it. The puzzle controls remain available, including file opening in the save dialog.

The same `css` option works with `createHtml` and `createCollectionHtml`. It is appended after the default styles and travels with every playable HTML download, including downloads made inside the player. Downloaded files restore the full header and retain publisher branding. Ordinary `.puz` exports contain puzzle data only.

See [styling and embedding](docs/player.md#styling-and-embedding) for the supported CSS hooks. Structural and accessibility styles remain included; a bare component kit is outside this API.

## Inputs and exports

`createHtml` accepts native `.puz` bytes, typed `PuzData`, or the documented authored puzzle object. Existing version-2 native snapshots are also accepted. `createHtml(puzzle, { progress })` explicitly includes a validated player progress snapshot.

The included UI currently plays connected rectangular A–Z grids with 3–64 rows/columns and entries of at least three letters, including circles. It preserves imported UTF-8 version-2.0 native bytes. New `.puz` encoding uses Windows-1252 version 1.3 and reports unrepresentable text. The headless ipuz profile supports additional features; ipuz input and answer-free play are not yet wired into this UI. Unsupported inputs fail before an HTML file is produced.

The HTML polyglot remains experimental. A reader requiring the native header at byte 2 needs the ordinary `.puz` download, and some applications filter by filename extension. Native `.puz` and the current HTML edition contain the answers. See the [portable file contract](docs/portable.md).

## A collection using the same player

```ts
import { createCollectionHtml } from '@somnai-dreams/cross/html'

const html = await createCollectionHtml({
  puzzles: [
    { slug: 'monday', puzzle: mondayBytes },
    { slug: 'tuesday', puzzle: tuesdayBytes },
  ],
  defaultSlug: 'monday',
  title: 'My crosswords',
})
```

Host that file for a collection with `?puzzle=monday` links. Each puzzle's download contains only that puzzle and the included UI. Cross Composer now consumes these APIs for its website and all four standalone exports; it supplies its collection and branding, with no player implementation or stylesheet in the consumer.

## Headless use

```ts
import { decodePuz, readIpuzBytes, answerFree } from '@somnai-dreams/cross'
```

Use the codecs and document rules without importing the UI. ipuz is the richer interchange format; Cross introduces no `.cross` encoding. The [document contract](SPEC.md) defines the supported ipuz profile, revision identity, and offline whole-grid verification. Answer-free verification permits offline guesses; it does not provide reveal or proof of an unaided solve.

[Exolve](https://github.com/viresh-ratnakar/exolve) already offers a complete player and HTML distribution. Cross's aim is a small, typed package with a provided UI, usable headless APIs, and explicit file-preservation rules. The [incumbent comparison](docs/alternatives.md) records the narrower evidence behind the current implementation and where reuse remains appropriate.

## Develop

```sh
bun install --frozen-lockfile
bun run build:player   # regenerate the included script and styles after UI changes
bun run check
bun run check:player   # verify bundle freshness and size
bun test
bun run fixtures
```

TypeScript 7, type-aware Oxlint, codec conformance, player engine tests, consumer-style packaging tests, and bundle checks run independently. The public fixtures contain original small puzzles and synthetic cases, including a UTF-8 `.puz` written with puzpy. The private consumer's supplied 15×15 puzzles are not in this repository.

Code, specifications, and original fixtures are MIT licensed. Referenced incumbent specifications retain their own terms. ipuz is a trademark of Puzzazz, Inc., used with permission.

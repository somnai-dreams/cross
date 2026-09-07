# Included player

The UI is a core part of Cross. The normal `createHtml(puzzle)` path provides it completely; custom rendering is optional. Cross Composer supplies a collection and branding, then calls this same package API. The player no longer belongs to the consumer repository.

## Public boundary

`@somnai-dreams/cross/html` exports:

- `createHtml(input, { progress? })`: a promise of a structured result containing the complete HTML bytes.
- `createCollectionHtml({ puzzles, defaultSlug, title?, storageKey? })`: the same included player with a validated collection and stable puzzle links.

Input is a native `Uint8Array`, `PuzData`, an authored puzzle, or a version-2 native snapshot. Native input retains its validated original bytes. Authored data uses:

```ts
type AuthoredPuzzle = {
  version: 1
  id: string
  title: string
  author: string
  description?: string
  grid: string[]                  // A–Z and # blocks
  across: (string | { text: string; hint: string })[]
  down: (string | { text: string; hint: string })[]
  circles?: number[]              // row-major physical cell indices
}
```

Across and Down are each in number order. The generated native snapshot keeps extra hints in interleaved native clue order. An optional progress value has the exact exported `Progress` type from `@somnai-dreams/cross/player`; it is validated before export. File opening parses the envelope, puzzle, and progress before rendering or restoring state.

This first included UI supports connected 3–64 rectangular grids with A–Z fill, circles, and entries of at least three letters in both directions. The lower-level native and ipuz profiles are broader. Bars, rebuses, ipuz import, and answer-free playing are not implemented in this renderer; publishing those through a headless API does not imply this UI can play them. No lossy ipuz-to-player conversion is performed.

## Ownership and build

| Source | Responsibility |
| --- | --- |
| `src/html.ts` | Turn a caller's puzzle into a complete playable file using the included assets |
| `src/player/puzzle.ts`, `engine.ts` | Validated player model and pure solving/progress operations |
| `src/player/main.ts` | One document's UI, input queue, ordered projection, and browser side effects |
| `src/player/style.css` | Responsive desktop/mobile presentation using system fonts |
| `src/player/config.ts`, `location.ts` | Optional collection, branding, storage namespace, and URL resolution |
| `src/portable.ts`, `src/puz.ts` | HTML/native packaging and binary compatibility |
| `scripts/build-player.ts` | Compile the UI with Bun; enforce its size budget |
| `generated/player.ts` | Reproducible bundled JS/CSS shipped with the package |

The generator contains the compiled assets as strings. The player bundle does not import the generator or embed another copy of itself. For re-export, it reads its own embedded script and style elements. This keeps the downloadable UI complete without recursive bundle growth or an asset server.

The default file embeds only one puzzle. A collection page additionally carries inert, validated `crossword-config` JSON: version 1, brand, storageKey, collection mode, and `{slug,puzzle}` entries. Its initial puzzle must match the native envelope. The collection is application data, not hard-coded UI content. Normal single-puzzle downloads omit that configuration and the other puzzles. Collection links preserve the document's hosting path.

The headless root entry imports no renderer or compiled UI. The player data entry exposes pure operations without accessing `document`. The HTML entry is the explicit opt-in to the provided UI bytes. There is no framework, runtime dependency, postinstall build, or external font/asset request.

## Runtime behavior

The player separates puzzle, mutable progress, ephemeral input, and DOM nodes. DOM nodes have document/puzzle lifetimes. A scheduled frame reads browser geometry, handles queued input, derives layout and selection, projects state, then applies focus, scroll, history, persistence, and download effects in order.

The UI includes desktop keyboard entry, independently scrolling Across/Down columns, mobile clue navigation and keyboard, pencil mode, hints, check/reveal scopes, pause and timer preferences, completion, restart, import, and all three export modes. The optional WebMCP surface uses that same input queue.

Local progress is tied to exact puzzle content, not only its ID. The storage namespace defaults to `cross`; a collection can select a namespace to retain its existing persistence. A standalone file always boots its embedded puzzle. Restored browser-local progress takes precedence on subsequent openings; an explicit HTML import's validated progress takes precedence when loaded. Saving creates a download, never an in-place file rewrite.

This is a complete-document player, not yet a multi-instance embedded widget with mount/destroy lifecycle. A self-contained file owns its document. Headless consumers can reuse the pure data/engine APIs in another interface.

## Verification

Public tests exercise the supplied-UI API without passing assets, the extracted engine, native bytes, malicious-looking text, progress validation, collection selection, larger grids, and the headless import boundary. CI regenerates and compares the included assets to their committed bytes under the pinned Bun version, and enforces 110,000 raw / 30,000 gzip bytes for JS plus CSS.

The consumer's two minis and two 15×15 puzzles retain cell/clue identity through the new API. All four generated HTML files pass puzpy 0.6.0 checksum and literal-rename round trips, preserving the entire HTML preamble and native payload.

Browser verification of the generated file covers startup, desktop typing, progress after reload, the save options, a 390×844 mobile viewport, touch-key entry, the clue dialog, and a collection deep link. The extracted stylesheet uses system fonts throughout; a regression test covers semicolons inside an external CSS import URL, which previously caused incorrect stripping and broken styles. Physical iOS/Safari and direct `file://` execution remain unverified; parser checks and HTTP-served browser checks do not establish those behaviors.

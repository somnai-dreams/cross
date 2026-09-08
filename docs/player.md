# Included player

The UI is a core part of Cross. The normal `createHtml(puzzle)` path provides it completely; custom rendering is optional. Cross Composer supplies a collection and branding, then calls this same package API. The player no longer belongs to the consumer repository.

## Public boundary

`@somnai-dreams/cross/html` exports:

- `createHtml(input, { progress?, site?, css?, chrome? })`: a promise of a structured result containing the complete HTML bytes. `site` supplies `{ name, homeUrl }`; `chrome` is `full` (default) or `puzzle` (no site header).
- `createCollectionHtml({ puzzles, defaultSlug, title?, storageKey?, css? })`: the same included player with a validated collection and stable puzzle links.

`@somnai-dreams/cross/embed` exports `mountPlayer(host, input, options?)`. It accepts the same inputs/options, defaults to puzzle-only chrome, and returns a structured result containing `{ frame, destroy }`. Importing it creates no DOM. The result means the frame has been inserted; the browser loads its document asynchronously.

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
| `src/embed.ts` | Mount that same file in a Blob-backed iframe and release it on destroy |
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

Both desktop and mobile offer **Zoom grid / Fit grid**. Fit shows the whole grid; zoom uses at least 40-pixel cells, rather than a fixed multiplier that leaves large puzzles unreadable. The board scrolls on both axes and follows the selected cell during entry and clue navigation. Clue columns keep their independent scroll positions.

Local progress is tied to exact puzzle content, not only its ID. The storage namespace defaults to `cross`; a collection can select a namespace to retain its existing persistence. A standalone file always boots its embedded puzzle. Restored browser-local progress takes precedence on subsequent openings; an explicit HTML import's validated progress takes precedence when loaded. Saving creates a download, never an in-place file rewrite.

The browser embed mounts the complete document in an iframe. Each instance has its own input queue, focus, dialogs, scrolling and timers. `destroy()` flushes pending progress, removes the frame, and revokes its Blob URL; destroying it twice is harmless. The host owns sizing and calls destroy before removing its view. Progress for the same puzzle still shares the browser's normal storage, so changing presentation does not reset a solve.

## Styling and embedding

Supply `css` from trusted application code. It is never read from imported puzzle metadata. The iframe provides the style boundary: your site stylesheet does not enter the player, and the player's stylesheet does not affect your site. Use the `css` option for player styling and `.cross-frame` or the returned frame for host sizing.

The supported color variables are `--ink`, `--muted`, `--line`, `--accent`, `--word`, `--selected`, `--background`, and `--surface`. `--font` sets the UI font; `--heading-font` sets the desktop heading font. Mobile headings retain the UI font. Supply variables on `:root` in the player CSS.

Stable selectors use `data-cross-part`: `header`, `workspace`, `heading`, `toolbar`, `layout`, `active-clue`, `grid`, `cell`, `clues`, `clue`, `mobile-dock`, `keyboard`, and `dialog`. Cells expose the state classes `block`, `selected`, `word-selected`, `pencilled`, `incorrect`, and `revealed`. Clue rows use `active` and `filled`. Other classes are implementation details.

Use those hooks for typography, colors, corner treatment, and clue spacing. Cross owns grid tracks, grid gap/border widths, letter positioning, hidden states, and focus behavior. Its responsive layout follows the frame's width, so a narrow embed uses the phone interface even on a desktop. Frame height is controlled by the host; there is no auto-height message protocol or separate rendering framework.

Custom CSS is embedded once with the included stylesheet. Re-export preserves that combined stylesheet, the publisher name/home link, and an explicitly requested progress snapshot. It drops the collection and restores full chrome so the downloaded file stands alone. CSS text is escaped so it cannot close the HTML style element. External `@import` rules are removed; use system fonts or inline data assets if the file must work offline. Other CSS resource URLs remain the publisher's responsibility.

The iframe is an application boundary, not a security sandbox for arbitrary HTML. `mountPlayer` accepts parsed crossword formats through `createHtml`, not executable imported HTML. Hosts with a content security policy must permit the Blob frame and the included data-URL module script.

## Verification

Public tests exercise the supplied-UI API without passing assets, the extracted engine, native bytes, malicious-looking text, progress validation, collection selection, larger grids, and the headless import boundary. CI regenerates and compares the included assets to their committed bytes under the pinned Bun version, and enforces 110,000 raw / 30,000 gzip bytes for JS plus CSS.

The consumer's two minis and two 15×15 puzzles retain cell/clue identity through the new API. All four generated HTML files pass puzpy 0.6.0 checksum and literal-rename round trips, preserving the entire HTML preamble and native payload.

Browser verification of the generated file covers startup, desktop typing, progress after reload, the save options, a 390×844 mobile viewport, touch-key entry, the clue dialog, and a collection deep link. The extracted stylesheet uses system fonts throughout; a regression test covers semicolons inside an external CSS import URL, which previously caused incorrect stripping and broken styles. Additional headless Chromium checks cover two independently styled embeds, progress after reload, destruction with a queued keystroke, repeated destruction, and reopening a styled progress export directly over `file://` with HTTP requests blocked. Physical iOS/Safari remain unverified.

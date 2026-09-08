# Included player

The UI is a core part of Cross. The normal `createHtml(puzzle)` path provides it completely; custom rendering is optional. Cross Composer supplies a collection and branding, then calls this same package API. The player no longer belongs to the consumer repository.

## Public boundary

`@somnai-dreams/cross/html` exports:

- `createHtml(input, { progress?, site?, css?, chrome? })`: a promise of a structured result containing the complete HTML bytes. `site` supplies `{ name, homeUrl }`; `chrome` is `full` (default) or `puzzle` (no site header).
- `createCollectionHtml({ puzzles, defaultSlug, title?, storageKey?, css? })`: the same included player with a validated collection and stable puzzle links.

`@somnai-dreams/cross/embed` exports `mountPlayer(host, input, options?)`. It accepts the same inputs/options, defaults to puzzle-only chrome, and returns a structured result containing `{ element, destroy }`. Importing it creates no DOM. On success, the root and its UI are already inserted. Layout follows the browser’s next resize/frame notifications. No iframe or Shadow DOM is created.

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
| `src/embed.ts`, `player-input.ts` | Validate input, mount the renderer into a host, and return its lifecycle handle |
| `src/player-assets.ts` | Apply publisher styles to the same scope in a mount or downloadable file |
| `src/player/puzzle.ts`, `engine.ts` | Validated player model and pure solving/progress operations |
| `src/player/mount.ts` | One instance’s input queue, DOM projection, events, persistence and cleanup |
| `src/player/main.ts` | Standalone document adapter: read embedded data/assets, mount, set page title and register browser tools |
| `src/player/style.css` | Responsive desktop/mobile presentation using system fonts |
| `src/player/config.ts`, `location.ts` | Optional collection, branding, storage namespace, and URL resolution |
| `src/portable.ts`, `src/puz.ts` | HTML/native packaging and binary compatibility |
| `scripts/build-player.ts` | Compile the UI with Bun; enforce its size budget |
| `generated/player.ts` | Reproducible bundled JS/CSS shipped with the package |

The generator contains the compiled assets as strings. The standalone bundle does not import the generator or embed another copy of itself: its adapter supplies its embedded script and style elements for re-export. A DOM embed imports the renderer source and carries the compiled standalone assets for downloads. This costs more bytes than playing an already-generated file, but needs no asset server or runtime fetch. Both paths run `createPlayer`; there is no second renderer.

The default file embeds only one puzzle. A collection page additionally carries inert, validated `crossword-config` JSON: version 1, brand, storageKey, collection mode, and `{slug,puzzle}` entries. Its initial puzzle must match the native envelope. The collection is application data, not hard-coded UI content. Normal single-puzzle downloads omit that configuration and the other puzzles. Collection links preserve the document's hosting path.

The headless root entry imports no renderer or compiled UI. The player data entry exposes pure operations without accessing `document`. The HTML entry is the explicit opt-in to the provided UI bytes. There is no framework, runtime dependency, postinstall build, or external font/asset request.

## Runtime behavior

The player separates puzzle, mutable progress, ephemeral input, and DOM nodes. DOM nodes have instance/puzzle lifetimes. A scheduled frame reads browser geometry, handles queued input, derives layout and selection, projects state, then applies focus, scroll, history, persistence, and download effects in order.

The UI includes desktop keyboard entry, independently scrolling Across/Down columns, mobile clue navigation and keyboard, pencil mode, hints, check/reveal scopes, pause and timer preferences, completion, restart, import, and all three export modes. The standalone document’s optional WebMCP surface uses that same input queue. A DOM mount does not register document-wide browser tools.

Both desktop and mobile offer **Zoom grid / Fit grid**. Fit shows the whole grid; zoom uses at least 40-pixel cells, rather than a fixed multiplier that leaves large puzzles unreadable. The board scrolls on both axes and follows the selected cell during entry and clue navigation. Clue columns keep their independent scroll positions.

Local progress is tied to exact puzzle content, not only its ID. The storage namespace defaults to `cross`; a collection can select a namespace to retain its existing persistence. A standalone file always boots its embedded puzzle. Restored browser-local progress takes precedence on subsequent openings; an explicit HTML import's validated progress takes precedence when loaded. Saving creates a download, never an in-place file rewrite.

The browser embed adds one `.cross-player` root inside its host. Each instance owns its input queue, focus, dialogs, scroll positions, event subscriptions and timers. IDs are unique across mounts, queries and delegated input stay within the root, and buttons do not submit an enclosing form. `destroy()` flushes queued input and saves progress before aborting listeners, disconnecting the resize observer, cancelling frames/timers, closing its dialog, revoking download URLs and removing its root. Repeated destruction is harmless. Async file/clipboard completions cannot dispatch into a destroyed instance.

The host owns sizing and calls `destroy()` before removing its view. Mounted players do not replace document titles, body classes or site history. A collection opened as a standalone document owns its own puzzle routing. Progress for the same puzzle shares normal browser storage; separate instances do not synchronize live edits.

## Styling and embedding

The player uses light DOM and native CSS scopes, with container queries for responsive layout. Host CSS can reach the UI directly through `.cross-player [data-cross-part="…"]`. Defaults are scoped to their player and private class names have a `cross-` prefix. The `css` option supplies trusted publisher CSS, scoped to the instance and appended after defaults; it is never read from puzzle metadata.

The supported color variables are `--ink`, `--muted`, `--line`, `--accent`, `--word`, `--selected`, `--background`, and `--surface`. `--font` sets the UI font; `--heading-font` sets the desktop heading font. Mobile headings retain the UI font. In the `css` option, use `:scope { --accent: … }` to address the player root. In a host stylesheet, use `.cross-player`.

Stable selectors use `data-cross-part`: `header`, `workspace`, `heading`, `toolbar`, `layout`, `active-clue`, `grid`, `cell`, `clues`, `clue`, `mobile-dock`, `keyboard`, and `dialog`. Cells expose the state classes `cross-block`, `cross-selected`, `cross-word-selected`, `cross-pencilled`, `cross-incorrect`, and `cross-revealed`. Clue rows use `cross-active` and `cross-filled`. Other classes are implementation details.

Use these hooks for typography, colors, corners and clue spacing. Cross owns grid tracks, gap/border geometry, letter positioning, hidden states and focus behavior. The responsive layout follows the container width, so a narrow mount uses the phone interface even on a desktop. The keyboard occupies a row inside the player; it is not fixed over the host viewport. Give the host an explicit height. Native modal dialogs use the browser top layer and temporarily make the rest of the document inert.

The same `css` option works in `createHtml` and `createCollectionHtml`. Re-export preserves the stylesheet, publisher name/home link, and an explicitly requested progress snapshot. It drops the collection and restores full chrome. Host stylesheet overrides are not copied automatically: use `css` for a theme that must travel with the file. CSS text is escaped so it cannot close the HTML style element. External `@import` rules are removed from exported HTML; other resource URLs remain the publisher’s responsibility.

A mount accepts puzzle data through the same validation boundary as the HTML generator. It does not run imported HTML as application code. The mount needs its bundled module and inline styles permitted by the host’s content security policy; standalone downloads also use a data-URL module script. There is no Blob frame or messaging protocol.

## Verification

Public tests exercise the supplied-UI API without passing assets, the extracted engine, native bytes, malicious-looking text, progress validation, collection selection, larger grids, and the headless import boundary. CI regenerates and compares the included assets to their committed bytes under the pinned Bun version, and enforces 110,000 raw / 30,000 gzip bytes for JS plus CSS.

The consumer's two minis and two 15×15 puzzles retain cell/clue identity through the new API. All four generated HTML files pass puzpy 0.6.0 checksum and literal-rename round trips, preserving the entire HTML preamble and native payload.

Browser verification of the generated file covers startup, desktop typing, progress after reload, the save options, a 390×844 mobile viewport, touch-key entry, the clue dialog, and a collection deep link. The extracted stylesheet uses system fonts throughout; a regression test covers semicolons inside an external CSS import URL, which previously caused incorrect stripping and broken styles. Additional headless Chromium checks cover two independently styled embeds, progress after reload, destruction with a queued keystroke, repeated destruction, and reopening a styled progress export directly over `file://` with HTTP requests blocked. Physical iOS/Safari remain unverified.

Run the browser regression fixture with `bun test/browser/serve.ts`, open `http://127.0.0.1:4177/`, and click **Run checks**. It checks actual DOM/CSS behavior: multiple mounts, IDs and ARIA targets, independent publisher themes, host CSS access, container resizing, desktop zoom, mobile clue dialogs, form-safe buttons, input isolation, routing ownership, queued input on destroy, listener cleanup and progress after remount. It runs separately from the Bun unit tests and CI; it adds no browser framework dependency. The UI requires browser support for CSS scopes, container queries and native dialogs.

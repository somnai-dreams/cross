# Portable HTML and native .puz

Cross includes the player UI as well as the native codec and HTML packaging previously implemented in Cross Composer. Use `createHtml` from `@somnai-dreams/cross/html` for the complete provided UI. This document describes the lower-level container; supplying assets manually is optional. This module is implemented and consumed by that player. Its container is experimental; this document records the current bytes and application boundary.

## Two downloads, one native payload

An ordinary `.puz` file begins with its two checksum bytes and `ACROSS&DOWN\0` signature. A playable HTML file has an HTML preamble and the same complete native payload at the end. The HTML is larger and is not merely the ordinary export with another filename.

The HTML contains:

1. A doctype, viewport metadata, inline CSS, and an empty `#app` mount element.
2. A `<script id="crossword-data" type="application/json">` containing the snapshot below. Angle brackets and ampersands are JSON-escaped.
3. A `<script id="player-code" type="module">` whose source is a base64 JavaScript data URL.
4. `<plaintext hidden aria-hidden="true">`, followed immediately by the original native `.puz` bytes through EOF. The raw tail is never interpreted as HTML. Optional collection metadata appears in an additional inert `crossword-config` block before the puzzle snapshot; ordinary single-puzzle exports omit it.

A browser runs the bundled player using the JSON copy. A signature-scanning `.puz` reader skips the preamble and reads the binary tail. A reader requiring the signature at byte 2 rejects the HTML; use ordinary `.puz` for it. Applications that filter by extension may still require a rename. The library does not control operating-system file associations.

`readPuzHtml` parses only the inert JSON and compares its decoded native bytes against the binary tail. It rejects different copies and never executes the imported player. `puzPayload` strips a preamble; it does not validate the resulting puzzle. Call `decodePuz` before using untrusted native bytes.

## Snapshot and player contract

```ts
type PuzHtmlSnapshot = {
  puzzle: {
    version: 2
    id: string
    puz: string       // Base64 of the native bytes, without an HTML preamble
    hints: string[]  // Native clue order: row-major starts, Across before Down at a shared start
  }
  progress: Json     // null when absent; interpreted by the supplied player
}
```

This version-2 envelope preserves the existing player's file shape. It is distinct from the ipuz document contract's draft version. The ID is a nonempty application identifier of at most 160 UTF-16 code units, not a cryptographic revision. Cross validates native bytes and the number/type of hints. Reading missing or null hints normalizes them to one empty string per clue. Unknown envelope/puzzle fields are rejected.

`readPuzHtmlData` validates a JSON string with Cross's strict JSON parser, including its 1,000,000 UTF-16-code-unit and 64-level nesting limits. `progress` must be present and contain valid JSON, but its domain rules belong to the renderer. A player must validate this value before restoring it, including which puzzle it belongs to. This transport field is not an ipuz `Document.attempt` and never passes through answer-free export.

A custom bundled module must mount into `#app`, obtain the inert `#crossword-data` text, and call `readPuzHtmlData`. Native decoding and progress validation then happen before rendering. The included player applies its puzzle and progress validators, retaining pencil marks, reveals, time, and selection. Embedded puzzle data takes precedence over its URL/last-opened preference.

`writePuzHtml(snapshot, { script, css })` accepts trusted application assets. The script must already contain its dependencies and implement the player. CSS `@import` rules are removed, but other remote references are not rewritten; the caller must supply assets that work offline. This low-level function does not fetch assets. The default `createHtml` API supplies Cross's own compiled renderer and styles; callers do not need to implement this contract themselves. To support re-export from an opened HTML file, the player can reuse `#player-style` and the base64 source on `#player-code`, as the included player does.

Saving progress creates a new download. It does not rewrite the file that was opened. Storage behavior and local-file browser restrictions remain application/platform concerns.

## Native data and preservation

`decodePuz` returns `PuzData`: title, author, copyright, notes, grid rows, separate Across/Down clue arrays, and circled physical cell indices. Rows use `#` blocks and A–Z solutions. Entry numbering follows row-major starts, with Across before Down at a shared start; entries have at least two cells.

The supported native profile is:

- Rectangular dimensions from 2 through 64 in either direction. Square shape, symmetry, and connectedness are not required. Irregular outlines use blocks in a rectangular bounding grid; void cells are not modeled.
- Regular unlocked versions 1.2, 1.3, and 1.4 with Windows-1252 text, and version 2.0 with strictly decoded UTF-8 text. Solutions remain A–Z.
- GEXT circles and checksummed unknown extension blocks. Header, solution, fill, text, and extension checksums are validated.
- Locked, diagramless, rebus, malformed, and unsupported-version files are rejected.

`encodePuz` writes a new version-1.3 file with blank player fill and optional circles. It rejects text outside Windows-1252 and embedded NULs rather than altering clues. It preserves the fields represented by `PuzData`, but it cannot reconstruct omitted fields such as unknown extensions, original fill, or reserved header bytes.

For byte-preserving re-export, retain validated original native bytes and pass those bytes to `writePuzHtml`. The packager does not decode and re-encode them. This also preserves version-2.0 Unicode and unknown metadata. `decodePuz` alone is a projection, not a lossless storage format. The consumer retains original bytes separately from its derived solving model; edits would need an explicit conversion policy.

The ipuz model supports additional features, including bars, rebus values, authored labels, linked clues, and answer-free verification. Native `PuzData` is a format-specific boundary, not a substitute for that model. A metadata-preserving `.puz`↔ipuz bridge is not implemented. Ordinary `.puz` and the current HTML polyglot contain the solution, so neither is an answer-free edition.

## Verification evidence

On 7 September 2026, the extracted modules passed the consumer's existing 41 tests, including hints/progress, HTML/native byte equality, unknown extension retention, corruption, repeated export, and markup-looking puzzle text. Four full player exports (two 5×5 and two 15×15) were literally renamed to `.puz` and loaded with puzpy 0.6.0. All passed its checksums and round-tripped byte-for-byte, including the HTML preamble. Those consumer puzzles are not fixtures in this public repository.

The public tests additionally cover asymmetric 4×3 and 45×45 grids, malformed envelopes, unsupported native variants, and the independent UTF-8 fixture. Generate that fixture with puzpy 0.6.0:

```python
import puz
p = puz.Puzzle('2.0')
p.encoding = 'UTF-8'
p.width = p.height = 3
p.solution = 'CATORETEN'
p.fill = '-' * 9
p.title = 'Symbols → ♠'
p.author = 'Cross synthetic fixtures'
p.copyright = 'MIT'
p.notes = 'UTF-8 native .puz fixture generated with puzpy 0.6.0.'
p.clues = ['Pet that purrs', 'Camping bed', 'You ___ here',
           'Five doubled', 'Rock containing metal', 'Two hands of fingers →']
p.save('fixtures/native-utf8.puz')
```

These are binary/parser compatibility checks. Native Across Lite and Puzzazz applications have not been tested. Earlier browser checks covered the consumer's save controls and downloaded files; direct `file://` execution was blocked by the browser tool's URL policy. Local-file startup and physical iOS/Safari behavior still need manual verification. No universal reader or browser compatibility claim is made.

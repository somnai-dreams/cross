# Cross

Cross is a small TypeScript library for crossword documents. It separates the public puzzle, optional answer key, completion verifier, and solving attempt. It reads and writes a deliberately bounded ipuz profile and can export an answer-free puzzle with an offline whole-grid completion check.

The runtime uses standard JavaScript and Web Crypto, with no dependencies, renderer, storage layer, or network service. The package exports TypeScript source for Bun and TypeScript-capable bundlers. Its document contract is experimental; see [SPEC.md](SPEC.md) for supported features, exact hash bytes, and limitations. Cross does not introduce a `.cross` file encoding.

## Use the package

Install from a specific Git commit for reproducible consumption:

```sh
bun add '@somnai-dreams/cross@github:somnai-dreams/cross#<commit-sha>'
```

```ts
import { answerFree, readIpuzBytes } from '@somnai-dreams/cross'

const bytes = new Uint8Array(await Bun.file('puzzle.ipuz').arrayBuffer())
const parsed = await readIpuzBytes(bytes)
if (!parsed.ok) {
  console.error(parsed.issue.path, parsed.issue.message)
} else {
  const exported = await answerFree(parsed.value)
  if (exported.ok) await Bun.write('public.ipuz', exported.value)
  else console.error(exported.issue.path, exported.issue.message)
}
```

The public API also exports `readIpuz`, `writeIpuz`, `revision`, `assess`, `entries`, `entryCells`, `sameEntry`, the extension field names, and the domain types. Parsing returns either a complete normalized document or a structured issue; it never returns a partial puzzle.

## Develop

```sh
bun install --frozen-lockfile
bun run check
bun test
bun run fixtures
bun src/cli.ts answer-free fixtures/ordinary.ipuz > /tmp/public.ipuz
```

Checks use TypeScript 7 and type-aware Oxlint. The toolchain and lockfile belong to this repository. No sibling checkout is needed. CI runs the same commands.

## Supported behavior

- Rectangular Across/Down grids, circles, internal bars, rebus cells, authored labels, and linked clues.
- Semantic import/export round trips, with explicit errors for unsupported fields and variants.
- Public revision identity that excludes the answer key and attempt.
- Separate incomplete, complete-unverified, correct, and incorrect assessments.
- Answer-free export using SHA-256 over an array of cell values, preserving rebus boundaries.

The answer-free check permits offline guesses. It provides neither per-cell reveal nor proof of an unaided solve. Independent-reader interoperability is not certified. Legacy ipuz checksum block conventions remain an explicit verification gate; the structured extension is implemented by Cross. See the specification before using this draft in a production format pipeline.

## Fixtures and license

The eleven small fixture documents are synthetic conformance cases. Some use artificial letter sequences or deliberately altered answers. `fixtures/vectors.json` freezes hash preimages and digests independently constructed with Python `hashlib` for the ordinary puzzle. The TypeScript suite separately exercises Unicode and canonical JSON ordering.

Code, the Cross specification, and the original synthetic fixtures are available under the MIT license. Referenced incumbent specifications retain their own terms. ipuz is a trademark of Puzzazz, Inc., used with permission.

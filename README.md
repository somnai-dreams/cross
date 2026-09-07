# Cross

Cross is a TypeScript library for publishing and exchanging crossword documents. It keeps the public puzzle, its answers, and a solver's progress separate, and reports when an import or export cannot preserve supported puzzle features.

Its purpose is to let constructors and custom players share document rules. For example, a publisher can remove an answer key while retaining a whole-grid completion check. The solver's progress still refers to the same public puzzle; editing a clue changes that reference so old progress is not silently attached to the edited puzzle.

## Why a separate library?

Cross owns document validation, revision identity, and answer-free publication independently of any player. Applications own their interface and persistence. Grid membership is derived from geometry, and crossing entries use the same physical answer cell. Removing an answer key does not require rebuilding the public puzzle.

The project uses [ipuz](https://www.puzzazz.com/ipuz) as its interchange format. ipuz already supports saved progress and verification without a solution. Cross implements a restricted profile plus experimental extensions; it introduces no `.cross` encoding.

There are good reasons to choose an existing project instead:

| Your main requirement | Start with |
| --- | --- |
| An embeddable player or a self-contained HTML crossword | [Exolve](https://github.com/viresh-ratnakar/exolve) |
| TypeScript import across PUZ, ipuz, JPZ, and XD | [xword-parser](https://github.com/mjkoo/xword-parser) |
| A puzzle manipulation library with a C API and GObject bindings | [libipuz](https://libipuz.org/libipuz-1.0/intro.html) |
| A custom browser application that needs Cross's publication and progress rules | Evaluate this draft against your actual puzzles |

We compared xword-parser's ipuz parser and unified model using eight synthetic fixtures. Its format-specific parser remains a possible source of future adapters, but the tested unified conversion loses data Cross needs, including saved fill and linked-clue details. The [comparison and reuse decision](docs/alternatives.md) records the exact source revision, results, and limits of that review.

## Current scope

The library reads and writes its ipuz profile, identifies public puzzle revisions, validates attempts, and exports answer-free editions with offline completion checks. A consumer currently uses it for build-time puzzle exports. Integration with a browser player's live state remains unproven.

Cross has no player, `.puz` adapter, HTML packager, construction-draft model, or persistence service. The next milestone is a complete constructor-to-player workflow with saved progress and portable export, plus an independent-reader check of the exchanged ipuz. See the [adoption criteria](docs/alternatives.md#what-would-justify-keeping-cross) before treating that workflow as delivered.

The runtime uses standard JavaScript and Web Crypto with no dependencies. The package exports TypeScript source for Bun and TypeScript-capable bundlers. The document contract is experimental; [SPEC.md](SPEC.md) defines supported features, exact hash bytes, and limitations.

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

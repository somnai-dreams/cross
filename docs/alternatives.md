# Why Cross exists

Cross is being evaluated as a shared document library for constructors and custom players. Its useful outcome is that both applications agree on the puzzle being published, which data contains answers, and which puzzle a saved attempt belongs to. A separate repository lets those rules be tested and consumed without depending on a particular player's UI or a constructor's internal state.

That case is only partly demonstrated. The current consumer exports authored puzzles during a build. The full constructor-to-player workflow still needs to work before we can claim Cross removes duplicated document logic in practice.

## Existing options

[ipuz](https://www.puzzazz.com/ipuz) already defines public grids, solutions, saved fill, and solution-free verification. Cross uses that format. Its stricter input profile and structured completion fingerprint are implementation choices with compatibility costs; neither establishes a need for a new file encoding.

[Exolve](https://github.com/viresh-ratnakar/exolve#serving-and-sharing) provides an interactive player and self-contained HTML distribution, with PUZ and ipuz conversion. It is a direct option for publishing a playable crossword. Cross serves applications that want their own interface and shared document rules. HTML portability alone does not distinguish Cross.

[libipuz](https://libipuz.org/libipuz-1.0/intro.html) already provides puzzle loading, manipulation, and saving. Its C/Rust implementation exposes a C API through GObject Introspection. Cross's browser/Bun runtime is a reason to consider a separate implementation, but its much narrower supported profile remains a limitation.

[xword-parser](https://github.com/mjkoo/xword-parser) already offers TypeScript imports for PUZ, ipuz, JPZ, and XD, including a unified model. TypeScript support and parsing without file I/O are not distinguishing features of Cross. We examined its ipuz path before deciding whether to replace Cross's reader.

## Reuse decision

Keep Cross's current ipuz reader for this draft. Do not adopt xword-parser's unified model as the source of truth. Reconsider its format-specific parsers when adding an actual new-format adapter; this review does not approve or reject its PUZ, JPZ, or XD implementations.

The reason is observable data loss in the tested path. On 7 September 2026, we ran eight Cross fixtures through `parseIpuz`, `convertIpuzToUnified`, and `validatePuzzle` from xword-parser commit [`f9f1168`](https://github.com/mjkoo/xword-parser/tree/f9f1168dfb46d554807c859062ae624a45bb8a0d). This is the ipuz processing sequence used by its `parse` entry point, invoked directly from source under Bun 1.3.14.

| Fixture | Observed behavior |
| --- | --- |
| Ordinary, circled, rebus | Dimensions, cell answers, clue tuples, and the tested circle flag survive. |
| Authored text labels | Primitive `A` becomes a value in the raw parser. Unified output loses the labels and all six clues, and passes validation. |
| Linked clues | Raw parsing drops display label, enumeration, and hints; it keeps `continued`, which unified conversion then drops. |
| Bars | Bar metadata survives; consumers must interpret it to derive entry geometry. |
| Saved progress | Raw parsing keeps saved fill. Unified output drops fill but retains the Cross attempt extension as opaque metadata. |
| Legacy verification | Raw parsing keeps the checksum; unified output drops it. |

The [raw parser](https://github.com/mjkoo/xword-parser/blob/f9f1168dfb46d554807c859062ae624a45bb8a0d/src/ipuz.ts#L422) therefore remains a different reuse candidate from the [unified conversion](https://github.com/mjkoo/xword-parser/blob/f9f1168dfb46d554807c859062ae624a45bb8a0d/src/ipuz.ts#L633). Adapting its output would still require validation and some access to the original input for Cross's current fields. For ipuz, that does not yet remove enough work to justify another parsing layer.

These are bounded compatibility observations, not a general quality ranking or a performance comparison. Cross also rejects many valid ipuz features, including void cells and non-ASCII fill. A file Cross rejects may be better served by another implementation. Neither these probes nor Cross's own tests certify interoperability with an independent solver.

The [probe](reviews/xword-parser.mjs) and [recorded output](reviews/xword-parser.json) are checked in. Reproduce against a temporary checkout, without adding a dependency to Cross:

```sh
git clone https://github.com/mjkoo/xword-parser.git /tmp/xword-parser-cross-review
git -C /tmp/xword-parser-cross-review checkout f9f1168dfb46d554807c859062ae624a45bb8a0d
bun docs/reviews/xword-parser.mjs /tmp/xword-parser-cross-review
```

The probe asserts observations about that exact revision and uses only the public synthetic fixtures. It imports the reviewed source modules directly; it does not exercise the published package, browser bundling, auto-detection, or other file formats.

## What would justify keeping Cross?

The next adoption milestone is one complete workflow:

```text
constructor report → Cross document → custom player → saved progress → portable export
```

The constructor adapter should validate source reports and derive the published document from them. The player should use Cross's document rules and keep selection, focus, and undo behavior in its UI state. Both should stop maintaining their own competing definitions of the published grid and answers.

To demonstrate that workflow:

1. Play a document exported by the constructor, save progress, reopen it, and check completion with both keyed and answer-free editions. A changed clue must prevent silent reuse of the previous attempt.
2. Open the portable export offline and recover the embedded document without changing supported puzzle features. A conversion that cannot retain a feature must identify it.
3. Check ordinary and supported variant exports in an independent reader, including the legacy checksum convention. Keep unsupported features explicit.

Reuse an existing parser wherever an adapter preserves the required data and removes implementation work. If these workflows need only a small adapter to an incumbent, shrink Cross to that adapter. A new file format would need a reproducible failure that an ipuz profile or extension cannot address.

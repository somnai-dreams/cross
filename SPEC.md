# Cross document contract — draft 0.1

Status: experimental profile, 7 September 2026. This draft is intended to be changed before adoption. The reference implementation is in `src/`; its conformance examples are in `fixtures/`. No `.cross` file extension, media type, public registry, or stability promise is established here. The [project rationale and reuse decision](docs/alternatives.md) explain why this implementation is being evaluated separately from the file format.

## 1. Boundary and purpose

The contract describes a published rectangular crossword independently of a renderer. File adapters parse complete input into the model before returning it. UI code receives normalized values, never partially parsed input or opaque source fields.

The initial wire adapter uses [ipuz v2](https://www.puzzazz.com/ipuz). The profile deliberately accepts a subset. A rejection means this implementation cannot preserve the input, not necessarily that the input is invalid ipuz.

There are four separate pieces:

| Piece | Owns | Does not own |
| --- | --- | --- |
| Public puzzle | Grid geometry, authored labels, clues, instructions, display metadata | Correct fill, solver progress |
| Optional answer key | One accepted value per playable cell; private explanation | A duplicate grid or duplicate answers for crossings |
| Verifier | No verifier, legacy ipuz checksum, or draft structured SHA-256 fingerprint | Stored completion status |
| Optional attempt | Public revision reference, entered cell values, elapsed milliseconds | Answer key, verdict, UI selection, undo history |

Cross also includes a complete desktop/mobile player, native `.puz` decoding/encoding, and a playable HTML polyglot packager, specified in the [portable file contract](docs/portable.md). That container currently embeds native bytes and renderer-owned progress, not this ipuz model. A metadata-preserving bridge between the two adapters is still needed. The native HTML edition contains the solution; it does not provide this contract's answer-free publication behavior.

## 2. Public model

The complete TypeScript shape is defined in [model.ts](src/model.ts). The following invariants are part of this draft, not merely conventions of its writer.

The grid is a row-major cell array with one integer width. Height is derived from length divided by width. Cells are either blocks or open cells. Open cells own their authored label, circle flag, right bar, and bottom bar. An internal bar belongs to the cell above it or to its left. Outer edges and boundaries against blocks do not carry bars.

An entry reference is `{start, direction}`, with a zero-based physical cell index and direction `across` or `down`. Entries are all maximal horizontal or vertical open runs of at least two cells, stopped by an edge, block, or bar. Entry paths, lengths, membership indexes, and joined answers are derived when needed. They are not additional mutable state. This profile does not admit arbitrary paths; if a later variant requires them, geometry ownership must be reconsidered instead of storing two competing descriptions.

Every playable cell belongs to at least one entry. Every entry start has a label. A label is a positive safe integer or a nonempty string other than `#`; digit-only strings normalize to numbers, and zero means no label. Labels need not be sequential or numeric. Labels are unique within each direction, so a clue reference resolves unambiguously. A start shared by Across and Down has one cell label.

Every entry has its own clue or belongs to one clue's ordered `continued` list. A continuation cannot refer to itself, repeat a target, overlap another continuation group, or chain through another group. A target may have a display-only “See…” clue of its own. The owner is followed by its continuations in authored order. Their display wording is retained rather than inferred from text.

A clue owns its entry reference, plain text, optional display label, enumeration, ordered replacement hints, and ordered continuation references. Empty optional text is `""`, absent lists are `[]`; published clue text must contain a non-whitespace character. An enumeration is display information and need not equal the number of cells, especially for rebuses. The application must not derive relationships by parsing phrases such as “See 1-Across.” Hints replace the displayed clue in sequence.

Normalized clue order is Across before Down, then ascending physical start index. The wire file's property order and clue-list order do not affect identity. Other arrays with authored semantics retain their order.

Editorial quality, crossword symmetry, connectedness, clue accuracy, word-list membership, and minimum three-letter fill are not document validity checks. Construction drafts with missing clues or missing answer-key cells need a future construction model; the reader must not pretend they are published puzzles.

## 3. Supported wire profile

The only accepted version/kind pair is `http://ipuz.org/v2` and `["http://ipuz.org/crossword#1"]`. Width and height are JSON integers from 1 through 64, with exact rectangular rows. The only block token is `#`; the empty token is zero. JSONP and embedded executable input are not accepted.

The allowed top-level fields are:

```text
version kind title author copyright intro dimensions puzzle solution
clues checksum saved explanation block empty volatile
io.github.somnai-dreams.cross:verification
io.github.somnai-dreams.cross:attempt
```

Unknown fields at every parsed object boundary cause `unsupported`. They are neither discarded nor held in an opaque object. In particular, a future answer-bearing extension must not accidentally survive answer-free export. Adding another supported field requires deciding its public/private ownership, identity behavior, and conversion rule.

The following normalization rules apply:

| Wire fact | Normalized fact |
| --- | --- |
| Primitive grid label, or `{cell, style}` | Block/open cell union |
| Missing/null `cell` inside an object; zero label | Open cell with no label |
| `null` as a whole grid cell | Rejected: void cell is outside this profile |
| Inline `shapebg: "circle"` | Circle flag |
| Inline `barred` containing T/R/B/L | Canonical internal right/bottom bar owners; duplicate declarations collapse |
| Clue tuple `[label,text]` or clue object | One clue shape; references resolved immediately |
| Missing/null optional title, author, copyright, intro | Empty string |
| Numeric enumeration | String representation |
| Solution cell containing 1–32 ASCII letters | One uppercase cell value, retaining rebus boundaries |
| Saved cell containing letters, zero, or empty string | Uppercase cell value or empty string |

Full solution and saved matrices must agree with every public block. Their internal value arrays contain only playable cells, in row-major order. Block markers are reinserted only by the wire writer. There is one answer per physical cell, including a crossing. Direction-dependent values, sets of acceptable per-cell values, non-ASCII fill, and partial answer keys are outside this profile. Lowercase ASCII fill is deliberately normalized to uppercase; case-sensitive puzzles are outside the profile.

Accepted clue-object fields are `number`, `clue`, `label`, `enumeration`, `hints`, and `continued`. Explicit cell paths, arbitrary clue directions, separate reveal answers, clue annotations, tags, images, givens, named styles, extra colors/shapes, custom tokens, and other puzzle kinds are rejected with a field path. These can be valid incumbent features; rejecting them is a limitation of this prototype.

Title, author, intro, clue text, replacement hints, and private explanation use the text-only subset of ipuz's HTML fields. Import decodes `amp`, `lt`, `gt`, `quot`, `apos`, and valid decimal/hex numeric entities exactly once. Raw angle brackets, raw ampersands, markup, and other named entities are rejected. Export escapes `&`, `<`, and `>`. Unicode text is otherwise preserved exactly, including whitespace and normalization form. Copyright, labels, and enumerations are plain strings. A renderer consumes all normalized strings as text, never executable markup.

Only a complete answer key can carry the optional private explanation. It is not copied to the public introduction. Public clues and hints are public by definition; removing private fields cannot detect an author who writes an answer directly into a clue or title.

The reference parser rejects duplicate JSON keys (including equivalent escapes), non-finite numbers, unpaired surrogates, nesting deeper than 64 levels, and input exceeding 1,000,000 UTF-16 code units. Hash inputs use [RFC 8785 canonical JSON](https://www.rfc-editor.org/rfc/rfc8785), which does not perform Unicode normalization. The byte API and CLI decode UTF-8 strictly. Consumers of the string API must apply the same rule when reading bytes.

## 4. Public revision identity

`JCS` below means RFC 8785 canonical JSON encoded as UTF-8, without a BOM or trailing newline. `SHA256` returns 64 lowercase hexadecimal characters. All model fields shown below are present, including empty text/lists and false flags.

```text
public = { title, author, copyright, intro, width, cells, clues }
revision = "sha256:" + SHA256(JCS(["cross/0.1/puzzle", public]))
```

This is a fingerprint of the complete normalized public puzzle. It includes geometry, authored labels, circles, bars, clue text, display labels, enumerations, hints, continuations, instructions, title, and credits. Even a title can participate in clueing. This draft conservatively changes revision for any authored public edit, including a credit correction; it does not guess which edits were harmless.

The revision excludes the answer key, verifier, salt, and attempt. It contains no answer preimage. Adding or removing the answer key preserves an attempt's attachment to the same public challenge. Changing a clue or other included field changes the revision. No fuzzy match or automatic migration attaches old progress to the new challenge.

A key correction can leave public identity unchanged. Correctness must therefore be recomputed against the current key/verifier; it must never be restored from a saved boolean. A separate authenticated edition identifier may be appropriate later, but is not being conflated with this public challenge fingerprint.

This value does not authenticate an author, prove a publisher's endorsement, or identify a byte-for-byte file. Two files may share a public challenge while carrying different attempts, private keys, verifiers, or wire formatting.

## 5. Completion verification

The verifier is an explicit union. There is at most one active scheme. When a document includes both a key and verifier, the reader must reject disagreement. When importing multiple legacy hashes together with a concrete key, the key must match one of them; that concrete key is the authoritative answer for assessment while attached.

### Legacy ipuz checksum

The reader accepts the standard `checksum` field containing a salt followed by one or more 40-character SHA-1 hex digests, normalizing digest case. For this draft's rectangular profile, the reference algorithm concatenates uppercase solution values and literal `#` block markers in row-major order, then appends the salt before UTF-8 hashing. The fixture `legacy-checksum.ipuz` records this interpretation explicitly. It has not yet been compared with an independently executing ipuz reader; that is an adoption gate, especially for block conventions.

Concatenation erases rebus cell boundaries. Two fills such as `["CA","T"]` and `["C","AT"]` have the same legacy preimage. This ambiguity exists regardless of which hash algorithm hashes that concatenated string. The reader preserves the scheme's behavior; it does not silently reinterpret a legacy digest as the new structured check.

### Draft structured SHA-256 verifier

The extension namespace is scoped to the somnai-dreams Cross project on GitHub. It is a documented local extension, not an ipuz-assigned field.

```json
{
  "io.github.somnai-dreams.cross:verification": {
    "version": "0.1",
    "salt": "000102030405060708090a0b0c0d0e0f",
    "digest": "fa60851cf51641bb48f4e72190ceed9b7d9a9f5d38614f4c33c5c2130f71c33e"
  }
}
```

The exporter generates 16 random salt bytes and represents them as 32 lowercase hexadecimal characters. The salt is public. The digest is:

```text
SHA256(JCS(["cross/0.1/solution", revision, salt, values]))
```

Here `salt` is the literal hex string, not decoded binary, and `values` is the complete uppercase playable-cell array. The array preserves cell boundaries. The domain string and revision bind the check to this interpretation and public challenge. The checked-in `answer-free.ipuz` and `vectors.json` provide exact bytes and a frozen result.

This verifier supports an offline whole-puzzle check. It does not provide per-cell checks, reveal, encryption, or proof of an unaided solve. Anyone holding the file can test guesses. A solver with only a few unknown letters can enumerate completions; short answers and low-entropy puzzles remain guessable. The salt discourages reusable precomputation but does not add secrecy. A person who replaces the document or code can replace the verifier too. No authenticity or strong cryptographic hiding claim is made.

### Assessment

Before assessment, the attempt's revision, value count, fill alphabet, and nonnegative safe-integer elapsed time must be valid. Invalid input returns an issue. Valid attempts produce exactly one of:

| Condition | Result |
| --- | --- |
| At least one playable value is empty | `incomplete` |
| All filled; neither key nor verifier | `complete-unverified` |
| All filled; matches attached key, otherwise the verifier | `correct` |
| All filled; does not match available checking data | `incorrect` |

“Correct” means matches the checking data in this document. A hash-only edition cannot establish that its author supplied a satisfiable or editorially correct puzzle. That requires constructor-side validation before publication.

## 6. Attempts and exports

`Attempt` is a snapshot: `{revision, values, elapsedMs}`. It is stored using standard `saved` fill plus the namespaced `attempt` object containing `version: "0.1"`, `revision`, and `elapsedMs`. It has no duplicated grid, embedded key, completion flag, or process-dependent identifier.

A plain ipuz `saved` field without the extension is attached to the imported document's current public revision with zero elapsed time. This is a one-time boundary assumption; no claim is made about where that saved fill originated. An explicit extension referencing another revision is rejected. An attempt extension without saved fill is rejected. The writer always emits the explicit attachment.

Both draft extensions are written with the namespace's `volatile` declaration set to `"*"`. An unaware editor should remove them on any change, following ipuz's extension rules. A Cross-aware writer can retain and validate them. The reader does not rely on another editor having honored volatility.

Normal export preserves all modeled facts. It need not preserve input whitespace, object order, syntactic shorthand, or duplicate declarations of the same bar. The writer reparses output and verifies equality with the normalized input, rejecting a conversion which changes modeled meaning. Writer callers must supply a normalized model; an impossible entry reference is a programmer invariant violation.

Answer-free export validates the complete source document first. Given a key, it computes a fresh structured verifier and emits only the public puzzle and that verifier. Given an existing verifier without a key, it preserves that scheme. With neither, completion-check export fails explicitly. It omits the answer key, private explanation, raw source data, and attempt by default. An explicit `includeAttempt` opt-in includes the solver's entered values and time; a completed attempt can itself reveal all answers. “Answer-free” describes the absent private key, not secrecy of deliberately shared progress or public prose.

The whole-grid verifier cannot be converted into a usable answer key. An eventual `.puz` writer must not invent dummy answers and describe them as compatible solutions. A conversion lacking required semantics must report a concrete failure or require an explicit lossy choice. No new `.puz` adapter is implemented in this slice.

## 7. Conformance and adoption

A local implementation conforms to this draft when it passes the checked-in profile, rejection, identity, round-trip, export, and completion examples. These tests are necessary, not a proof that every possible input is handled correctly.

The code is now distributed as a separate experimental package and used for build-time exports. That extraction does not establish interoperability or suitability for a player's live state. Before broader adoption: compare ordinary and variant files in an independent reader; resolve legacy block-checksum conventions; add an explicit `.puz` conversion report; decide whether broader Unicode fill, richer text, and arbitrary entry paths are required by actual puzzles; and stabilize namespace ownership/version migration rules. If these pressures can be handled by ipuz adapters and a typed model, there is no need for another file encoding. A future `.cross` format should be justified by a concrete interoperability failure demonstrated with a fixture.

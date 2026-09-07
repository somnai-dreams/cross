import { canonical, object, parseJson, type Json, type JsonObject } from './json'
import { entries, entryCells, fail, sameEntry, type Attempt, type Cell, type Clue, type Document, type EntryRef, type Failure, type Label, type Puzzle, type Result, type Verifier } from './model'
import { matches, revision, solutionDigest } from './verification'

// Draft namespace belongs to the current project's published hostname.
export const namespace = 'io.github.somnai-dreams.cross'
export const verificationField = `${namespace}:verification`
export const attemptField = `${namespace}:attempt`

function fields(value: JsonObject, allowed: readonly string[], path: string): Failure | null {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) return fail('unsupported', `${path}.${key}`, 'Field is outside Cross profile 0.1; it was not discarded.')
  return null
}

function plainText(value: Json | undefined, path: string): Result<string> {
  if (value === undefined || value === null) return { ok: true, value: '' }
  if (typeof value !== 'string') return fail('invalid-data', path, 'Expected text.')
  return { ok: true, value }
}

/** This profile supports text and basic entities in HTML fields, but no markup. */
function text(value: Json | undefined, path: string): Result<string> {
  const parsed = plainText(value, path)
  if (!parsed.ok) return parsed
  if (/[<>]/.test(parsed.value)) return fail('unsupported', path, 'HTML markup and unescaped angle brackets are outside the plain text profile.')
  let decoded = ''
  for (const entity of parsed.value.split(/(&[^;\s]*;|&)/)) {
    if (!entity.startsWith('&')) { decoded += entity; continue }
    switch (entity) {
      case '&amp;': decoded += '&'; break
      case '&lt;': decoded += '<'; break
      case '&gt;': decoded += '>'; break
      case '&quot;': decoded += '"'; break
      case '&apos;': decoded += "'"; break
      default: {
        const numeric = /^&#(?:[0-9]+|x[0-9a-f]+);$/i.test(entity)
        const code = !numeric ? NaN : entity[2]!.toLowerCase() === 'x' ? parseInt(entity.slice(3, -1), 16) : Number(entity.slice(2, -1))
        if (!Number.isInteger(code) || code < 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return fail('unsupported', path, 'Unsupported entity or unescaped ampersand.')
        decoded += String.fromCodePoint(code)
      }
    }
  }
  return { ok: true, value: decoded }
}

function htmlText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function label(value: Json | undefined, path: string): Result<Label | null> {
  if (value === undefined || value === null || value === 0 || value === '0') return { ok: true, value: null }
  if (typeof value === 'string' && /^\d+$/.test(value)) value = Number(value)
  if (value === 0) return { ok: true, value: null }
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? { ok: true, value } : fail('invalid-data', path, 'Labels must be positive safe integers or nonempty text.')
  }
  const parsed = plainText(value, path)
  if (!parsed.ok) return parsed
  if (parsed.value === '' || parsed.value === '#') return fail('invalid-data', path, 'Empty or reserved clue label.')
  return parsed
}

function matrix(value: Json | undefined, width: number, height: number, path: string): Result<Json[]> {
  if (!Array.isArray(value) || value.length !== height) return fail('invalid-data', path, 'Rows do not match height.')
  const output: Json[] = []
  for (let row = 0; row < height; row++) {
    const items = value[row]!
    if (!Array.isArray(items) || items.length !== width) return fail('invalid-data', `${path}[${row}]`, 'Columns do not match width.')
    output.push(...items)
  }
  return { ok: true, value: output }
}

function values(value: Json | undefined, puzzle: Puzzle, empty: boolean, path: string): Result<string[]> {
  const rows = matrix(value, puzzle.width, puzzle.cells.length / puzzle.width, path)
  if (!rows.ok) return rows
  const output: string[] = []
  for (let index = 0; index < puzzle.cells.length; index++) {
    const cell = rows.value[index]!
    if (puzzle.cells[index]!.kind === 'block') {
      if (cell !== '#') return fail('invalid-data', `${path}[cell ${index}]`, 'Block disagrees with public grid.')
    } else if (empty && (cell === 0 || cell === '0' || cell === '')) output.push('')
    else if (typeof cell === 'string' && /^[A-Za-z]{1,32}$/.test(cell)) output.push(cell.toUpperCase())
    else return fail('unsupported', `${path}[cell ${index}]`, 'Expected one ASCII A–Z value per cell (1–32 letters); directional/multiple values are outside this profile.')
  }
  return { ok: true, value: output }
}

export async function readIpuzBytes(bytes: Uint8Array): Promise<Result<Document>> {
  let source: string
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  catch { return fail('invalid-json', '$', 'Input is not valid UTF-8.') }
  return readIpuz(source)
}

/** Parse the entire document at the boundary. No raw input survives in the model. */
export async function readIpuz(source: string): Promise<Result<Document>> {
  const parsed = parseJson(source)
  if (!parsed.ok) return parsed
  const raw = parsed.value
  if (!object(raw)) return fail('invalid-data', '$', 'Expected a puzzle object.')
  const topError = fields(raw, ['version', 'kind', 'title', 'author', 'copyright', 'intro', 'dimensions', 'puzzle', 'solution', 'clues', 'checksum', 'saved', 'explanation', 'block', 'empty', 'volatile', verificationField, attemptField], '$')
  if (topError !== null) return topError
  if (raw['version'] !== 'http://ipuz.org/v2' || !Array.isArray(raw['kind']) || raw['kind'].length !== 1 || raw['kind'][0] !== 'http://ipuz.org/crossword#1') return fail('unsupported', '$.kind', 'This draft reads ipuz v2 rectangular crossword#1 only.')
  if ((raw['block'] !== undefined && raw['block'] !== null && raw['block'] !== '#') ||
      (raw['empty'] !== undefined && raw['empty'] !== null && raw['empty'] !== 0 && raw['empty'] !== '0')) return fail('unsupported', '$', 'Custom block/empty tokens are outside this profile.')
  const dimensions = raw['dimensions']
  if (!object(dimensions)) return fail('invalid-data', '$.dimensions', 'Missing dimensions.')
  const dimensionError = fields(dimensions, ['width', 'height'], '$.dimensions')
  if (dimensionError !== null) return dimensionError
  const width = dimensions['width'], height = dimensions['height']
  if (typeof width !== 'number' || typeof height !== 'number' || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 64 || height > 64) return fail('invalid-data', '$.dimensions', 'Dimensions must be integers from 1 to 64.')
  const grid = matrix(raw['puzzle'], width, height, '$.puzzle')
  if (!grid.ok) return grid
  const cells: Cell[] = [], bars: string[] = []
  for (const item of grid.value) {
    const index = cells.length, path = `$.puzzle[cell ${index}]`
    if (item === null) return fail('unsupported', path, 'Omitted/void cells are outside this rectangular profile.')
    const record = object(item) ? item : { cell: item }
    const error = fields(record, ['cell', 'style'], path)
    if (error !== null) return error
    const style = record['style'] ?? {}
    if (!object(style)) return fail('unsupported', `${path}.style`, 'Named styles require an adapter.')
    const styleError = fields(style, ['shapebg', 'barred'], `${path}.style`)
    if (styleError !== null) return styleError
    if (style['shapebg'] !== undefined && style['shapebg'] !== null && style['shapebg'] !== 'circle') return fail('unsupported', `${path}.style.shapebg`, 'Only circles are supported.')
    const barred = style['barred'] ?? ''
    if (typeof barred !== 'string' || !/^[TRBL]*$/.test(barred)) return fail('invalid-data', `${path}.style.barred`, 'Expected T/R/B/L bar flags.')
    bars.push(barred)
    if (record['cell'] === '#') {
      if (barred !== '' || style['shapebg'] === 'circle') return fail('unsupported', path, 'Decorated blocks are outside this profile.')
      cells.push({ kind: 'block' })
    } else {
      const name = label(record['cell'], `${path}.cell`)
      if (!name.ok) return name
      cells.push({ kind: 'open', label: name.value, circled: style['shapebg'] === 'circle', rightBar: false, bottomBar: false })
    }
  }
  // Each internal edge has one owner: the cell above or to its left.
  for (let index = 0; index < cells.length; index++) {
    for (const side of bars[index]!) {
      const horizontal = side === 'L' || side === 'R'
      const owner = side === 'L' ? index - 1 : side === 'T' ? index - width : index
      const neighbour = owner + (horizontal ? 1 : width)
      if (owner < 0 || neighbour >= cells.length || (horizontal && Math.floor(owner / width) !== Math.floor(neighbour / width))) return fail('unsupported', `$.puzzle[cell ${index}].style.barred`, 'Outer bars are outside this profile.')
      const cell = cells[owner]!, next = cells[neighbour]!
      if (cell.kind !== 'open' || next.kind !== 'open') return fail('unsupported', `$.puzzle[cell ${index}].style.barred`, 'Bars must separate two playable cells.')
      if (horizontal) cell.rightBar = true
      else cell.bottomBar = true
    }
  }
  const title = text(raw['title'], '$.title'), author = text(raw['author'], '$.author')
  const copyright = plainText(raw['copyright'], '$.copyright'), intro = text(raw['intro'], '$.intro')
  if (!title.ok) return title
  if (!author.ok) return author
  if (!copyright.ok) return copyright
  if (!intro.ok) return intro
  const puzzle: Puzzle = { title: title.value, author: author.value, copyright: copyright.value, intro: intro.value, width, cells, clues: [] }
  const paths = entries(puzzle)
  if (paths.length === 0) return fail('invalid-data', '$.puzzle', 'No entries of at least two cells.')
  const covered = cells.map(() => false)
  for (const entry of paths) {
    const cell = cells[entry.start]!
    if (cell.kind !== 'open' || cell.label === null) return fail('invalid-data', '$.puzzle', 'Every entry start needs an authored label.')
    if (paths.some(other => {
      const otherCell = cells[other.start]!
      return other.start !== entry.start && other.direction === entry.direction && otherCell.kind === 'open' && otherCell.label === cell.label
    })) return fail('invalid-data', '$.puzzle', 'Entry labels must be unique within each direction.')
    for (const index of entryCells(puzzle, entry)) covered[index] = true
  }
  if (cells.some((cell, i) => cell.kind === 'open' && !covered[i])) return fail('invalid-data', '$.puzzle', 'Every playable cell must belong to an entry.')
  function reference(rawNumber: Json | undefined, direction: EntryRef['direction'], path: string): Result<EntryRef> {
    const name = label(rawNumber, path)
    if (!name.ok) return name
    const found = paths.find(entry => {
      const cell = cells[entry.start]!
      return entry.direction === direction && cell.kind === 'open' && cell.label === name.value
    })
    return found === undefined ? fail('invalid-data', path, 'Clue reference does not resolve to an entry.') : { ok: true, value: found }
  }
  const clueGroups = raw['clues']
  if (!object(clueGroups)) return fail('invalid-data', '$.clues', 'Missing clues.')
  const groupError = fields(clueGroups, ['Across', 'Down'], '$.clues')
  if (groupError !== null) return groupError
  for (const direction of ['across', 'down'] as const) {
    const group = direction === 'across' ? 'Across' : 'Down', list = clueGroups[group] ?? []
    if (!Array.isArray(list)) return fail('invalid-data', `$.clues.${group}`, 'Expected an array.')
    for (let index = 0; index < list.length; index++) {
      const rawClue = list[index]!, path = `$.clues.${group}[${index}]`
      const item: Json = Array.isArray(rawClue) && rawClue.length === 2 ? { number: rawClue[0]!, clue: rawClue[1]! } : rawClue
      if (!object(item)) return fail('unsupported', path, 'Expected numbered clue tuple or object.')
      const error = fields(item, ['number', 'clue', 'label', 'enumeration', 'hints', 'continued'], path)
      if (error !== null) return error
      const owner = reference(item['number'], direction, `${path}.number`)
      const clueText = text(item['clue'], `${path}.clue`), displayLabel = plainText(item['label'], `${path}.label`)
      const enumeration = plainText(typeof item['enumeration'] === 'number' ? String(item['enumeration']) : item['enumeration'], `${path}.enumeration`)
      if (!owner.ok) return owner
      if (!clueText.ok) return clueText
      if (!displayLabel.ok) return displayLabel
      if (!enumeration.ok) return enumeration
      if (clueText.value.trim() === '') return fail('invalid-data', `${path}.clue`, 'Published clues must contain text.')
      if (puzzle.clues.some(clue => sameEntry(clue.entry, owner.value))) return fail('invalid-data', path, 'Duplicate clue owner.')
      const hints: string[] = [], continued: EntryRef[] = []
      const rawHints = item['hints'] ?? [], rawContinued = item['continued'] ?? []
      if (!Array.isArray(rawHints) || !Array.isArray(rawContinued)) return fail('invalid-data', path, 'Hints and continuations must be arrays.')
      for (const hint of rawHints) {
        const parsedHint = text(hint, `${path}.hints`)
        if (!parsedHint.ok) return parsedHint
        hints.push(parsedHint.value)
      }
      for (const ref of rawContinued) {
        if (!object(ref)) return fail('invalid-data', `${path}.continued`, 'Invalid continuation.')
        const refError = fields(ref, ['number', 'direction'], `${path}.continued`)
        if (refError !== null) return refError
        if (ref['direction'] !== 'Across' && ref['direction'] !== 'Down') return fail('unsupported', `${path}.continued`, 'Unsupported direction.')
        const target = reference(ref['number'], ref['direction'] === 'Across' ? 'across' : 'down', `${path}.continued`)
        if (!target.ok) return target
        if (sameEntry(target.value, owner.value) || continued.some(entry => sameEntry(entry, target.value))) return fail('invalid-data', `${path}.continued`, 'Self or repeated continuation.')
        continued.push(target.value)
      }
      puzzle.clues.push({ entry: owner.value, text: clueText.value, displayLabel: displayLabel.value, enumeration: enumeration.value, hints, continued })
    }
  }
  puzzle.clues.sort((a, b) => a.entry.direction === b.entry.direction ? a.entry.start - b.entry.start : a.entry.direction === 'across' ? -1 : 1)
  for (const entry of paths) {
    const owners = puzzle.clues.filter(clue => clue.continued.some(target => sameEntry(target, entry)))
    const clue = puzzle.clues.find(candidate => sameEntry(candidate.entry, entry))
    if (owners.length > 1 || (owners.length > 0 && clue !== undefined && clue.continued.length > 0)) return fail('unsupported', '$.clues', 'Overlapping or chained continuation groups are outside this profile.')
    if (owners.length === 0 && clue === undefined) return fail('invalid-data', '$.clues', 'An entry has no clue or continuation owner.')
  }
  let key: Document['key'] = null
  if (raw['solution'] !== undefined && raw['solution'] !== null) {
    const solution = values(raw['solution'], puzzle, false, '$.solution'), explanation = text(raw['explanation'], '$.explanation')
    if (!solution.ok) return solution
    if (!explanation.ok) return explanation
    key = { values: solution.value, explanation: explanation.value }
  } else if (raw['explanation'] !== undefined && raw['explanation'] !== null) return fail('unsupported', '$.explanation', 'Private explanation requires an answer key in this profile.')
  let verifier: Verifier = { kind: 'none' }
  const checksum = raw['checksum'], structured = raw[verificationField]
  if (checksum !== undefined && checksum !== null) {
    if (!Array.isArray(checksum) || checksum.length < 2 || typeof checksum[0] !== 'string' || !checksum.slice(1).every(item => typeof item === 'string' && /^[a-f\d]{40}$/i.test(item))) return fail('invalid-data', '$.checksum', 'Expected salt followed by one or more SHA-1 hex digests.')
    const digests: string[] = []
    for (const digest of checksum.slice(1)) {
      if (typeof digest !== 'string') throw new Error('Validated checksum lost its string type.')
      digests.push(digest.toLowerCase())
    }
    verifier = { kind: 'ipuz-sha1', salt: checksum[0], digests: [digests[0]!, ...digests.slice(1)] }
  }
  if (structured !== undefined && structured !== null) {
    if (verifier.kind !== 'none') return fail('unsupported', '$.checksum', 'Use exactly one verification scheme.')
    if (!object(structured)) return fail('invalid-data', verificationField, 'Invalid verification extension.')
    const error = fields(structured, ['version', 'salt', 'digest'], verificationField)
    if (error !== null) return error
    if (structured['version'] !== '0.1' || typeof structured['salt'] !== 'string' || !/^[a-f\d]{32}$/.test(structured['salt']) || typeof structured['digest'] !== 'string' || !/^[a-f\d]{64}$/.test(structured['digest'])) return fail('invalid-data', verificationField, 'Expected version 0.1, a 16-byte hex salt, and SHA-256 digest.')
    verifier = { kind: 'cross-sha256', salt: structured['salt'], digest: structured['digest'] }
  }
  if (key !== null && verifier.kind !== 'none' && !await matches(puzzle, verifier, key.values)) return fail('mismatch', '$.solution', 'Answer key disagrees with the verification fingerprint.')
  const volatility = raw['volatile']
  if (volatility !== undefined && volatility !== null) {
    if (!object(volatility)) return fail('invalid-data', '$.volatile', 'Expected extension volatility object.')
    const error = fields(volatility, [namespace], '$.volatile')
    if (error !== null) return error
    if (volatility[namespace] !== '*') return fail('unsupported', '$.volatile', 'Draft extensions must be removed by unaware editors on any change.')
  }
  let attempt: Attempt | null = null
  const saved = raw['saved'], session = raw[attemptField]
  if (saved !== undefined && saved !== null) {
    const fill = values(saved, puzzle, true, '$.saved')
    if (!fill.ok) return fill
    const currentRevision = await revision(puzzle)
    let elapsedMs = 0
    if (session !== undefined && session !== null) {
      if (!object(session)) return fail('invalid-data', attemptField, 'Invalid attempt extension.')
      const error = fields(session, ['version', 'revision', 'elapsedMs'], attemptField)
      if (error !== null) return error
      if (session['version'] !== '0.1' || typeof session['elapsedMs'] !== 'number' || !Number.isSafeInteger(session['elapsedMs']) || session['elapsedMs'] < 0) return fail('invalid-data', attemptField, 'Invalid attempt version/time.')
      if (session['revision'] !== currentRevision) return fail('mismatch', attemptField, 'Saved attempt belongs to a different public challenge.')
      elapsedMs = session['elapsedMs']
    }
    attempt = { revision: currentRevision, values: fill.value, elapsedMs }
  } else if (session !== undefined && session !== null) return fail('invalid-data', attemptField, 'Attempt extension requires saved fill.')
  return { ok: true, value: { puzzle, key, verifier, attempt } }
}

function toIpuz(document: Document): JsonObject {
  const { puzzle, key, verifier, attempt } = document
  function rows(items: Json[]): Json[][] {
    const output: Json[][] = []
    for (let index = 0; index < items.length; index += puzzle.width) output.push(items.slice(index, index + puzzle.width))
    return output
  }
  function fillRows(items: string[]): Json[][] {
    let index = 0
    return rows(puzzle.cells.map(cell => {
      if (cell.kind === 'block') return '#'
      const value = items[index++]!
      return value === '' ? 0 : value
    }))
  }
  function entryLabel(entry: EntryRef): Label {
    const cell = puzzle.cells[entry.start]!
    if (cell.kind !== 'open' || cell.label === null) throw new Error('Validated entry lost its label.')
    return cell.label
  }
  function clueValue(clue: Clue): JsonObject {
    const item: JsonObject = { number: entryLabel(clue.entry), clue: htmlText(clue.text) }
    if (clue.displayLabel !== '') item['label'] = clue.displayLabel
    if (clue.enumeration !== '') item['enumeration'] = clue.enumeration
    if (clue.hints.length > 0) item['hints'] = clue.hints.map(htmlText)
    if (clue.continued.length > 0) item['continued'] = clue.continued.map(entry => ({ direction: entry.direction === 'across' ? 'Across' : 'Down', number: entryLabel(entry) }))
    return item
  }
  const output: JsonObject = {
    version: 'http://ipuz.org/v2', kind: ['http://ipuz.org/crossword#1'],
    title: htmlText(puzzle.title), author: htmlText(puzzle.author), copyright: puzzle.copyright, intro: htmlText(puzzle.intro),
    dimensions: { width: puzzle.width, height: puzzle.cells.length / puzzle.width },
    puzzle: rows(puzzle.cells.map(cell => {
      if (cell.kind === 'block') return { cell: '#' }
      const item: JsonObject = { cell: cell.label ?? 0 }, style: JsonObject = {}
      if (cell.circled) style['shapebg'] = 'circle'
      const barred = `${cell.rightBar ? 'R' : ''}${cell.bottomBar ? 'B' : ''}`
      if (barred !== '') style['barred'] = barred
      if (Object.keys(style).length > 0) item['style'] = style
      return item
    })),
    clues: {
      Across: puzzle.clues.filter(clue => clue.entry.direction === 'across').map(clueValue),
      Down: puzzle.clues.filter(clue => clue.entry.direction === 'down').map(clueValue)
    }
  }
  if (key !== null) { output['solution'] = fillRows(key.values); if (key.explanation !== '') output['explanation'] = htmlText(key.explanation) }
  switch (verifier.kind) {
    case 'none': break
    case 'ipuz-sha1': output['checksum'] = [verifier.salt, ...verifier.digests]; break
    case 'cross-sha256': output[verificationField] = { version: '0.1', salt: verifier.salt, digest: verifier.digest }; break
  }
  if (attempt !== null) {
    output['saved'] = fillRows(attempt.values)
    output[attemptField] = { version: '0.1', revision: attempt.revision, elapsedMs: attempt.elapsedMs }
  }
  if (verifier.kind === 'cross-sha256' || attempt !== null) output['volatile'] = { [namespace]: '*' }
  return output
}

/** Validate the generated representation before returning bytes to a caller. */
export async function writeIpuz(document: Document): Promise<Result<string>> {
  const count = document.puzzle.cells.filter(cell => cell.kind === 'open').length
  if (!Number.isInteger(document.puzzle.width) || document.puzzle.width < 1 || document.puzzle.width > 64 ||
      (document.key !== null && document.key.values.length !== count) ||
      (document.attempt !== null && document.attempt.values.length !== count)) return fail('invalid-data', '$', 'Invalid normalized dimensions or value count.')
  const output = canonical(toIpuz(document))
  const checked = await readIpuz(output)
  if (!checked.ok) return checked
  if (canonical(checked.value) !== canonical(document)) return fail('invalid-data', '$', 'Writer input must be a normalized document; conversion would change its meaning.')
  return { ok: true, value: output }
}

export async function answerFree(document: Document, includeAttempt = false): Promise<Result<string>> {
  const validated = await writeIpuz(document)
  if (!validated.ok) return validated
  let verifier = document.verifier
  if (document.key !== null) {
    const random = crypto.getRandomValues(new Uint8Array(16))
    const salt = Array.from(random, byte => byte.toString(16).padStart(2, '0')).join('')
    verifier = { kind: 'cross-sha256', salt, digest: await solutionDigest(document.puzzle, document.key.values, salt) }
  }
  if (verifier.kind === 'none') return fail('invalid-data', '$.verification', 'Completion-check export requires an answer key or existing verifier.')
  return writeIpuz({ puzzle: document.puzzle, key: null, verifier, attempt: includeAttempt ? document.attempt : null })
}

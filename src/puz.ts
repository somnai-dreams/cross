import { fail, type Direction, type Failure, type Result } from './model'

/** Native .puz data. Original bytes are retained separately for lossless re-export. */
export type PuzData = {
  title: string; author: string; copyright: string; notes: string
  grid: string[]; across: string[]; down: string[]; circles: number[]
}
function invalid(message: string): Failure { return fail('invalid-data', '$.puz', message) }

function starts(grid: readonly string[]): { start: number; direction: Direction }[] {
  const width = grid[0]!.length, solution = grid.join('')
  const output: { start: number; direction: Direction }[] = []
  for (let start = 0; start < solution.length; start++) {
    if (solution[start] === '#') continue
    if ((start % width === 0 || solution[start - 1] === '#') && start % width < width - 1 && solution[start + 1] !== '#') output.push({ start, direction: 'across' })
    if ((start < width || solution[start - width] === '#') && start + width < solution.length && solution[start + width] !== '#') output.push({ start, direction: 'down' })
  }
  return output
}

function validateData(puzzle: PuzData): Failure | null {
  const width = puzzle.grid[0]?.length ?? 0
  if (width < 2 || width > 64 || puzzle.grid.length < 2 || puzzle.grid.length > 64 ||
    puzzle.grid.some(row => row.length !== width || !/^[A-Z#]+$/.test(row))) return invalid('Use a rectangular 2–64 grid with A–Z letters and # blocks.')
  const solution = puzzle.grid.join(''), ordered = starts(puzzle.grid)
  if (ordered.length === 0 || ordered.filter(entry => entry.direction === 'across').length !== puzzle.across.length ||
    ordered.filter(entry => entry.direction === 'down').length !== puzzle.down.length) return invalid('Provide one clue for every across and down entry, in number order.')
  for (let i = 0; i < solution.length; i++) {
    if (solution[i] === '#') continue
    const adjacent = [i - width, i + width]
    if (i % width > 0) adjacent.push(i - 1)
    if (i % width < width - 1) adjacent.push(i + 1)
    if (!adjacent.some(index => index >= 0 && index < solution.length && solution[index] !== '#')) return invalid('Every open cell must belong to an entry of at least two cells.')
  }
  if (puzzle.circles.some(index => !Number.isInteger(index) || index < 0 || index >= solution.length || solution[index] === '#')) return invalid('Only open cells can be circled.')
  return null
}

const signature = new TextEncoder().encode('ACROSS&DOWN\0')
const latin = new TextDecoder('windows-1252')
const characters1252 = latin.decode(Uint8Array.from({ length: 256 }, (_, i) => i))

export function toBase64(bytes: Uint8Array): string {
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return btoa(text)
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), c => c.charCodeAt(0))
}

/** A polyglot has a preamble. Return only the actual puzzle, never its player. */
export function puzPayload(input: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  for (let offset = 2; offset <= input.length - signature.length; offset++) {
    if (signature.every((byte, i) => input[offset + i] === byte)) return input.slice(offset - 2)
  }
  return input
}

export function checksum(bytes: Uint8Array, initial = 0): number {
  let sum = initial
  for (const byte of bytes) sum = (((sum & 1) !== 0 ? (sum >>> 1) | 0x8000 : sum >>> 1) + byte) & 0xffff
  return sum
}

/** Validate native bytes and decode supported fields. This does not retain unknown metadata. */
export function decodePuz(bytes: Uint8Array): Result<PuzData> {
  if (bytes.length < 52 || !signature.every((byte, i) => bytes[i + 2] === byte)) return invalid('This file does not have an Across Lite .puz header.')
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const width = bytes[44]!, height = bytes[45]!, count = data.getUint16(46, true)
  const size = width * height
  if (width < 2 || width > 64 || height < 2 || height > 64 || bytes.length < 52 + size * 2) return invalid('This .puz grid is truncated or outside the supported 2–64 cell dimensions.')
  if (data.getUint16(48, true) !== 1) return invalid('Diagramless .puz files are outside this profile.')
  if (data.getUint16(50, true) !== 0) return invalid('This puzzle has a locked solution. Export an unlocked copy.')
  const version = latin.decode(bytes.subarray(24, 27))
  if (!/^1\.[234]$/.test(version) && version !== '2.0') return invalid('This .puz version is not supported.')
  const decoder = version === '2.0' ? new TextDecoder('utf-8', { fatal: true }) : latin
  const solutionBytes = bytes.subarray(52, 52 + size)
  const fillBytes = bytes.subarray(52 + size, 52 + size * 2)
  const solution = latin.decode(solutionBytes)
  if (!/^[A-Z.]+$/.test(solution)) return invalid('This .puz reader supports A–Z crossword solutions.')
  const strings: string[] = []
  let offset = 52 + size * 2, textSum = 0, globalSum = checksum(fillBytes, checksum(solutionBytes, checksum(bytes.subarray(44, 52))))
  for (let i = 0; i < count + 4; i++) {
    const end = bytes.indexOf(0, offset)
    if (end === -1) return invalid('This .puz file has incomplete title or clue data.')
    const value = bytes.subarray(offset, end)
    try { strings.push(decoder.decode(value)) } catch { return invalid('This puzzle contains invalid UTF-8 text.') }
    if (value.length > 0 && (i !== count + 3 || version !== '1.2')) {
      const checked = bytes.subarray(offset, end + (i < 3 || i === count + 3 ? 1 : 0))
      textSum = checksum(checked, textSum); globalSum = checksum(checked, globalSum)
    }
    offset = end + 1
  }
  const sums = [checksum(bytes.subarray(44, 52)), checksum(solutionBytes), checksum(fillBytes), textSum]
  const mask = new TextEncoder().encode('ICHEATED')
  if (data.getUint16(0, true) !== globalSum || data.getUint16(14, true) !== sums[0] ||
    sums.some((sum, i) => bytes[16 + i] !== ((sum & 255) ^ mask[i]!) || bytes[20 + i] !== ((sum >>> 8) ^ mask[i + 4]!))) return invalid('This .puz file failed its checksum. It may be damaged.')
  const circles: number[] = []
  while (offset < bytes.length) {
    if (bytes.length - offset < 9) return invalid('This .puz file has a truncated extension.')
    const tag = latin.decode(bytes.subarray(offset, offset + 4)), length = data.getUint16(offset + 4, true), start = offset + 8
    if (start + length >= bytes.length || bytes[start + length] !== 0) return invalid('This .puz extension is incomplete.')
    if (data.getUint16(offset + 6, true) !== checksum(bytes.subarray(start, start + length))) return invalid('This .puz extension failed its checksum.')
    switch (tag) {
      case 'GRBS': case 'RTBL': case 'RUSR': return invalid('Rebus puzzles need multiple letters in a square. This version supports one letter per square.')
      case 'GEXT':
        if (length !== size) return invalid('The circled-square data does not match the grid.')
        for (let i = 0; i < size; i++) if ((bytes[start + i]! & 0x80) !== 0) circles.push(i)
        break
      default: break // Unknown extensions remain intact in the retained source payload.
    }
    offset = start + length + 1
  }
  const grid: string[] = [], across: string[] = [], down: string[] = []
  let clue = 3
  for (let row = 0; row < height; row++) grid.push(solution.slice(row * width, (row + 1) * width).replaceAll('.', '#'))
  for (const entry of starts(grid)) {
    if (entry.direction === 'across') across.push(strings[clue++] ?? '')
    else down.push(strings[clue++] ?? '')
  }
  if (clue !== count + 3) return invalid('The clue count does not match the .puz grid.')
  const decoded = { title: strings[0]!, author: strings[1]!, copyright: strings[2]!, notes: strings.at(-1)!, grid, across, down, circles }
  const issue = validateData(decoded)
  return issue ?? { ok: true, value: decoded }
}

/** Write a new Windows-1252 .puz. Use validated original bytes for lossless re-export. */
export function encodePuz(puzzle: PuzData): Result<Uint8Array<ArrayBuffer>> {
  const issue = validateData(puzzle)
  if (issue !== null) return issue
  const width = puzzle.grid[0]!.length, height = puzzle.grid.length
  const solution = puzzle.grid.join('')
  const ordered = starts(puzzle.grid)
  let a = 0, d = 0
  const strings = [puzzle.title, puzzle.author, puzzle.copyright, ...ordered.map(entry => entry.direction === 'across' ? puzzle.across[a++]! : puzzle.down[d++]!), puzzle.notes]
  const encoded: Uint8Array[] = []
  for (const text of strings) {
    const values: number[] = []
    for (const char of text) {
      const byte = characters1252.indexOf(char)
      if (byte <= 0) return invalid(`The character “${char}” cannot be exported in a standard .puz file.`)
      values.push(byte)
    }
    encoded.push(new Uint8Array(values))
  }
  const size = solution.length, circled = puzzle.circles.length > 0
  const bytes = new Uint8Array(52 + size * 2 + encoded.reduce((sum, text) => sum + text.length + 1, 0) + (circled ? size + 9 : 0))
  const data = new DataView(bytes.buffer)
  bytes.set(signature, 2); bytes.set(new TextEncoder().encode('1.3\0'), 24)
  bytes[44] = width; bytes[45] = height; data.setUint16(46, ordered.length, true); bytes[48] = 1
  for (let i = 0; i < size; i++) { const cell = solution[i]!; bytes[52 + i] = cell === '#' ? 46 : cell.charCodeAt(0); bytes[52 + size + i] = cell === '#' ? 46 : 45 }
  const headerSum = checksum(bytes.subarray(44, 52)), solutionSum = checksum(bytes.subarray(52, 52 + size)), fillSum = checksum(bytes.subarray(52 + size, 52 + size * 2))
  let offset = 52 + size * 2, textSum = 0, globalSum = checksum(bytes.subarray(52, 52 + size * 2), headerSum)
  for (let i = 0; i < encoded.length; i++) {
    const text = encoded[i]!
    bytes.set(text, offset)
    if (text.length > 0) { const checked = bytes.subarray(offset, offset + text.length + (i < 3 || i === encoded.length - 1 ? 1 : 0)); textSum = checksum(checked, textSum); globalSum = checksum(checked, globalSum) }
    offset += text.length + 1
  }
  data.setUint16(0, globalSum, true); data.setUint16(14, headerSum, true)
  const sums = [headerSum, solutionSum, fillSum, textSum], mask = new TextEncoder().encode('ICHEATED')
  for (let i = 0; i < 4; i++) { bytes[16 + i] = (sums[i]! & 255) ^ mask[i]!; bytes[20 + i] = (sums[i]! >>> 8) ^ mask[i + 4]! }
  if (circled) {
    bytes.set(new TextEncoder().encode('GEXT'), offset); data.setUint16(offset + 4, size, true)
    for (const index of puzzle.circles) bytes[offset + 8 + index] = 128
    data.setUint16(offset + 6, checksum(bytes.subarray(offset + 8, offset + 8 + size)), true)
  }
  return { ok: true, value: bytes }
}

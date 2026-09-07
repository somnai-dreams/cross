import { canonical } from './json'
import { fail, type Assessment, type Attempt, type Document, type Puzzle, type Result, type Verifier } from './model'

export async function hash(algorithm: 'SHA-1' | 'SHA-256', text: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest(algorithm, new TextEncoder().encode(text)))
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function revision(puzzle: Puzzle): Promise<string> {
  return `sha256:${await hash('SHA-256', canonical(['cross/0.1/puzzle', puzzle]))}`
}

export async function solutionDigest(puzzle: Puzzle, values: string[], salt: string): Promise<string> {
  return hash('SHA-256', canonical(['cross/0.1/solution', await revision(puzzle), salt, values]))
}

export async function matches(puzzle: Puzzle, verifier: Verifier, values: string[]): Promise<boolean> {
  switch (verifier.kind) {
    case 'none': return false
    case 'cross-sha256': return await solutionDigest(puzzle, values, verifier.salt) === verifier.digest
    case 'ipuz-sha1': {
      // Draft interpretation of "all values": include block markers in reading order.
      let index = 0, solution = ''
      for (const cell of puzzle.cells) solution += cell.kind === 'block' ? '#' : values[index++]!
      return verifier.digests.includes(await hash('SHA-1', solution + verifier.salt))
    }
  }
}

export async function assess(document: Document, attempt: Attempt): Promise<Result<Assessment>> {
  if (attempt.revision !== await revision(document.puzzle)) return fail('mismatch', '$.attempt.revision', 'Attempt belongs to a different public challenge.')
  const count = document.puzzle.cells.filter(cell => cell.kind === 'open').length
  if (attempt.values.length !== count || attempt.values.some(value => !/^[A-Z]{0,32}$/.test(value)) ||
      !Number.isSafeInteger(attempt.elapsedMs) || attempt.elapsedMs < 0) return fail('invalid-data', '$.attempt', 'Invalid fill or elapsed time.')
  if (attempt.values.includes('')) return { ok: true, value: 'incomplete' }
  if (document.key !== null) return { ok: true, value: document.key.values.every((value, i) => value === attempt.values[i]) ? 'correct' : 'incorrect' }
  if (document.verifier.kind === 'none') return { ok: true, value: 'complete-unverified' }
  return { ok: true, value: await matches(document.puzzle, document.verifier, attempt.values) ? 'correct' : 'incorrect' }
}

import { fail, type Result } from './model'

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
export type JsonObject = { [key: string]: Json }
export function object(value: Json | undefined): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Native parsing handles grammar; this pass checks information JSON.parse discards. */
export function parseJson(text: string): Result<Json> {
  if (text.length > 1_000_000) return fail('invalid-json', '$', 'Document exceeds the draft 1,000,000 UTF-16 code unit limit.')
  let value: Json
  try { value = JSON.parse(text) as Json } catch { return fail('invalid-json', '$', 'Invalid JSON syntax.') }
  let offset = 0
  function whitespace(): void { while (offset < text.length && /[\t\n\r ]/.test(text[offset]!)) offset++ }
  function string(): string {
    const start = offset++
    while (text[offset] !== '"') {
      if (text[offset] === '\\') offset++
      offset++
    }
    offset++
    return JSON.parse(text.slice(start, offset)) as string
  }
  function scan(depth: number): string | null {
    if (depth > 64) return 'JSON nesting exceeds 64 levels.'
    whitespace()
    switch (text[offset]) {
      case '{': {
        offset++; whitespace()
        const keys = new Set<string>()
        while (text[offset] !== '}') {
          whitespace()
          const key = string()
          if (keys.has(key)) return `Duplicate JSON property: ${JSON.stringify(key)}.`
          keys.add(key); whitespace(); offset++
          const error = scan(depth + 1)
          if (error !== null) return error
          whitespace()
          if (text[offset] === ',') offset++
        }
        offset++; return null
      }
      case '[': {
        offset++; whitespace()
        while (text[offset] !== ']') {
          const error = scan(depth + 1)
          if (error !== null) return error
          whitespace()
          if (text[offset] === ',') offset++
        }
        offset++; return null
      }
      case '"': string(); return null
      default:
        while (offset < text.length && !/[\t\n\r ,}\]]/.test(text[offset]!)) offset++
        return null
    }
  }
  function representable(item: Json): boolean {
    switch (typeof item) {
      case 'number': return Number.isFinite(item)
      case 'string': return item.isWellFormed()
      case 'object':
        if (item === null) return true
        if (Array.isArray(item)) return item.every(representable)
        return Object.entries(item).every(([key, child]) => key.isWellFormed() && representable(child))
      case 'boolean': return true
      default: throw new Error('Native JSON parser returned a non-JSON value.')
    }
  }
  const error = scan(0)
  if (error !== null) return fail('invalid-json', '$', error)
  if (!representable(value)) return fail('invalid-json', '$', 'Non-finite numbers and unpaired Unicode surrogates are unsupported.')
  return { ok: true, value }
}

/** RFC 8785 ordering/serialization for validated I-JSON values. No Unicode folding. */
export function canonical(value: Json): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key]!)}`).join(',')}}`
}

import { isRecord, type Direction } from './puzzle'

export type PlayerRequest =
  | { type: 'select'; number: number; direction: Direction }
  | { type: 'type'; letters: string }
  | { type: 'read' }

type Tool = {
  name: string
  description: string
  inputSchema: object
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }
  execute: (input: unknown) => unknown
}
type ModelContext = { registerTool: (tool: Tool, options: { signal: AbortSignal }) => void | Promise<void> }

// The optional browser API is an adapter; solving state does not depend on it.
export function registerPlayerTools(request: (input: PlayerRequest) => Promise<unknown>): void {
  const context = (document as Document & { modelContext?: ModelContext }).modelContext
  if (context === undefined) return
  const lifecycle = new AbortController()
  const tools: Tool[] = [
    {
      name: 'read_crossword',
      description: 'Read the current crossword clues, entered letters, selected clue, and progress. Does not reveal solutions.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: input => {
        if (!isRecord(input) || Object.keys(input).length !== 0) return { error: 'Expected an empty object.' }
        return request({ type: 'read' })
      },
    },
    {
      name: 'select_crossword_clue',
      description: 'Select an across or down clue in the visible player without entering an answer.',
      inputSchema: { type: 'object', properties: { number: { type: 'integer', minimum: 1 }, direction: { type: 'string', enum: ['across', 'down'] } }, required: ['number', 'direction'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: input => {
        if (!isRecord(input) || Object.keys(input).length !== 2 || typeof input['number'] !== 'number' || !Number.isInteger(input['number']) || input['number'] < 1 || (input['direction'] !== 'across' && input['direction'] !== 'down')) return { error: 'Provide a positive clue number and across or down.' }
        return request({ type: 'select', number: input['number'], direction: input['direction'] })
      },
    },
    {
      name: 'type_crossword_letters',
      description: 'Enter up to 25 letters from the selected square, using the same pencil, skip-filled, and next-clue settings as keyboard typing. Updates and saves the visible puzzle.',
      inputSchema: { type: 'object', properties: { letters: { type: 'string', pattern: '^[a-zA-Z]{1,25}$' } }, required: ['letters'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: input => {
        if (!isRecord(input) || Object.keys(input).length !== 1 || typeof input['letters'] !== 'string' || !/^[a-zA-Z]{1,25}$/.test(input['letters'])) return { error: 'Provide 1–25 letters, A–Z.' }
        return request({ type: 'type', letters: input['letters'].toUpperCase() })
      },
    },
  ]
  for (const tool of tools) {
    try {
      void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(error => {
        console.warn(`Could not register ${tool.name}`, error)
      })
    } catch (error) { console.warn(`Could not register ${tool.name}`, error) }
  }
  window.addEventListener('pagehide', event => { if (!event.persisted) lifecycle.abort() })
}

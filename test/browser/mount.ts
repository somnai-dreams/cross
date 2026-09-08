import { mountPlayer, type MountedPlayer } from '../../src/embed'
import { parsePuzzle } from '../../src/player/puzzle'
import { parseProgress } from '../../src/player/engine'

function required<T extends Element>(selector: string, type: { new(...args: never[]): T }): T {
  const node = document.querySelector(selector)
  if (!(node instanceof type)) throw new Error(`Missing ${selector}`)
  return node
}
function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
const frames = async (): Promise<void> => {
  for (let i = 0; i < 3; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
}
const input = { version: 1 as const, id: 'cross-dom-browser-check', title: 'First puzzle', author: 'Synthetic', grid: ['CAT', 'ARE', 'TEN'], across: ['Pet', 'Exist', 'Number'], down: ['Pet', 'Exist', 'Number'] }
const first = required('#first', HTMLDivElement)
const second = required('#second', HTMLDivElement)
const output = required('#results', HTMLPreElement)
const run = required('#run', HTMLButtonElement)
const instances: MountedPlayer[] = []
const passed: string[] = []
const check = (condition: boolean, name: string): void => { assert(condition, name); passed.push(name) }

async function checks(): Promise<void> {
  const title = document.title
  const bodyClass = document.body.className
  const locationBefore = location.href
  const historyBefore: unknown = history.state
  localStorage.removeItem(`cross:progress:${input.id}`)
  localStorage.removeItem(`cross:progress:${input.id}-other`)
  const a = await mountPlayer(first, input, { css: ':scope { --word: #ffdde7; --selected: #ffb0c7 }' })
  const b = await mountPlayer(second, { ...input, id: `${input.id}-other`, title: 'Second puzzle' }, { css: ':scope { --word: #ddf5dd; --selected: #ace6ad }' })
  assert(a.ok && b.ok, 'Mount valid puzzles')
  instances.push(a.value, b.value)
  const root = a.value.element
  const grid = root.querySelector<HTMLElement>('[role="grid"]')!
  const dock = root.querySelector<HTMLElement>('[data-cross-part="mobile-dock"]')!
  await frames()
  check(root.ownerDocument === document && document.querySelector('iframe') === null && root.shadowRoot === null, 'Both players use the host DOM')
  const ids = Array.from(document.querySelectorAll('[id]'), node => node.id)
  check(new Set(ids).size === ids.length, 'Instance IDs are unique')
  check(root.querySelector(`#${grid.getAttribute('aria-activedescendant')!}`) !== null, 'Grid ARIA points to its own cell')
  check(getComputedStyle(root).getPropertyValue('--word').trim() === '#ffdde7' && getComputedStyle(b.value.element).getPropertyValue('--word').trim() === '#ddf5dd', 'Publisher themes stay in their own instances')
  check(getComputedStyle(root.querySelector('[data-cross-part="clue"]')!).borderRadius === '0px', 'Host CSS reaches public styling hooks')
  const outside = required('#outside', HTMLButtonElement)
  check(getComputedStyle(outside).fontSize === '19px' && getComputedStyle(outside).color === 'rgb(12, 34, 56)', 'Player defaults leave host controls unchanged')
  outside.click()
  check(getComputedStyle(dock).display === 'none', 'Wide containers use the desktop layout')
  check(getComputedStyle(b.value.element.querySelector('[data-cross-part="mobile-dock"]')!).display !== 'none', 'Narrow containers use the mobile layout on desktop')
  check(root.querySelector('[data-command="zoom"]')!.getBoundingClientRect().width > 0, 'Zoom remains available on desktop')
  grid.focus()
  grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'C', bubbles: true, cancelable: true }))
  await frames()
  check(root.querySelector('[data-cell="0"]')!.textContent.endsWith('C') && !b.value.element.querySelector('[data-cell="0"]')!.textContent.endsWith('C'), 'Keyboard entry affects only the focused player')
  history.pushState({ hostRoute: 'kept' }, '', '#host-route')
  window.dispatchEvent(new PopStateEvent('popstate', { state: { hostRoute: 'kept' } }))
  await frames()
  check(document.title === title && document.body.className === bodyClass && location.hash === '#host-route', 'Mounted players leave document title, body and routing alone')
  history.replaceState(historyBefore, '', locationBefore)
  first.style.width = '380px'
  await frames()
  check(getComputedStyle(dock).display !== 'none' && dock.getBoundingClientRect().bottom <= root.getBoundingClientRect().bottom + 1, 'Resize observes the container and keeps its keyboard inside')
  root.querySelector<HTMLButtonElement>('[data-command="panel:clues"]')!.click()
  await frames()
  check(root.querySelector('dialog')!.open && root.querySelector('[data-cross-part="clues"]')!.getBoundingClientRect().height > 0, 'The mobile clue dialog remains visible with scoped CSS')
  root.querySelector<HTMLButtonElement>('[data-command="close"]')!.click()
  await frames()
  // Flush a keystroke before its animation frame, then release all owned resources.
  grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'A', bubbles: true, cancelable: true }))
  a.value.destroy()
  a.value.destroy()
  check(!root.isConnected && second.contains(b.value.element), 'Repeated destroy removes only its own player')
  const saved = localStorage.getItem(`cross:progress:${input.id}`)
  assert(saved !== null, 'Saved progress exists')
  const puzzle = parsePuzzle(input)
  assert(puzzle.ok, 'Fixture puzzle validates')
  const raw: unknown = JSON.parse(saved)
  const progress = parseProgress(raw, puzzle.value)
  check(progress.ok && progress.value.fills[0]!.letter === 'C' && progress.value.fills[1]!.letter === 'A', 'Destroy persists queued typing')
  grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'Z', bubbles: true }))
  await frames()
  check(localStorage.getItem(`cross:progress:${input.id}`) === saved, 'Destroyed listeners no longer process input')
  const restored = await mountPlayer(first, input)
  assert(restored.ok, 'Remount succeeds')
  instances.push(restored.value)
  await frames()
  check(restored.value.element.querySelector('[data-cell="0"]')!.textContent.endsWith('C') && restored.value.element.querySelector('[data-cell="1"]')!.textContent.endsWith('A'), 'Remount restores saved progress')
  // Buttons must not submit the host form, including ones created after startup.
  let submits = 0
  const form = required('form', HTMLFormElement)
  form.addEventListener('submit', event => { event.preventDefault(); submits++ }, { once: true })
  restored.value.element.querySelector<HTMLButtonElement>('[data-command="letter:T"]')!.click()
  await frames()
  check(submits === 0, 'Player buttons do not submit the enclosing form')
}

run.addEventListener('click', () => {
  run.disabled = true
  void checks().then(() => { output.textContent = `${passed.length} passed\n${passed.join('\n')}` }).catch(error => {
    output.textContent = `FAIL: ${String(error)}\nPassed: ${passed.join(', ')}`
    console.error(error)
  })
})
window.addEventListener('pagehide', () => { for (const instance of instances) instance.destroy() })

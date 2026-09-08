import type { PlayerConfiguration } from './config'
import { createNavigation } from './location'
import { isRecord, parsePuzzle, puzzleFile, type Puzzle } from './puzzle'
import {
  checkCells, defaultPreferences, emptyFill, entryAt, erase, filledCount, isSolved,
  moveArrow, newProgress, nextAfterLetter, nextEntry, parseProgress,
  selectEntry, serializeProgress, type Progress, type Selection,
} from './engine'
import { importPuzzle } from './puz'
import { encodePuz } from './puz-format'
import { portableHtml, puzzleFilename, type PlayerAssets } from './portable'
import { revealScrollOffset, desktopGridWidth, gridTypography, wordScrollOffset, zoomGridWidth } from './layout'
import type { PlayerRequest } from './webmcp'

type Panel = 'library' | 'help' | 'settings' | 'check' | 'reveal' | 'restart' | 'complete' | 'share' | 'clues' | 'download' | null
type Action =
  | { type: 'command'; command: string }
  | { type: 'cell'; index: number }
  | { type: 'entry'; index: number }
  | { type: 'key'; key: string; shift: boolean }
  | { type: 'import'; puzzle: Puzzle; progress: Progress | null }
  | { type: 'error'; message: string }
  | { type: 'visibility'; hidden: boolean }
  | { type: 'layout' }
  | { type: 'agent'; request: PlayerRequest; resolve: (result: unknown) => void }
  | { type: 'navigate'; search: string; historyState: unknown; source: 'link' | 'history' }
  | { type: 'copy-result'; url: string; copied: boolean }
  | { type: 'downloaded' }

const icon = (name: string, size = 20): string => {
  let content: string
  switch (name) {
    case 'pause': content = '<path d="M9 5v14M15 5v14"/>'; break
    case 'play': content = '<path d="m8 5 11 7-11 7Z"/>'; break
    case 'left': content = '<path d="m14 6-6 6 6 6"/>'; break
    case 'right': content = '<path d="m10 6 6 6-6 6"/>'; break
    case 'pencil': content = '<path d="m15 5 4 4M4 20l5-1L20 8a2.8 2.8 0 0 0-4-4L5 15Z"/>'; break
    case 'check': content = '<path d="m5 12 4 4L19 6"/>'; break
    case 'eye': content = '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>'; break
    case 'settings': content = '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor" stroke="none"/><circle cx="15" cy="17" r="3" fill="currentColor" stroke="none"/>'; break
    case 'help': content = '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .6-1.5 1-1.5 2M12 16h.01"/>'; break
    case 'close': content = '<path d="m6 6 12 12M18 6 6 18"/>'; break
    case 'upload': content = '<path d="M12 16V3m-5 5 5-5 5 5M5 15v5h14v-5"/>'; break
    case 'grid': content = '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 12h16M12 4v16"/>'; break
    case 'bulb': content = '<path d="M9 18h6m-5 3h4M8 15a6 6 0 1 1 8 0c-1 .7-1 2-1 3H9c0-1 0-2.3-1-3Z"/>'; break
    case 'erase': content = '<path d="M9 5h12v14H9l-7-7Z"/><path d="m12 9 6 6m0-6-6 6"/>'; break
    case 'swap': content = '<path d="M4 8h16m-4-4 4 4-4 4M20 16H4m4-4-4 4 4 4"/>'; break
    case 'link': content = '<path d="m10 13 4-2M9 15l-2 1a4 4 0 0 1-4-7l4-2a4 4 0 0 1 5 1m0 8a4 4 0 0 0 5 1l4-2a4 4 0 0 0-4-7l-2 1"/>'; break
    default: throw new Error(`Unknown icon: ${name}`)
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${content}</svg>`
}

let nextInstance = 0

export type PlayerInstance = {
  element: HTMLDivElement
  destroy: () => void
  request: (input: PlayerRequest) => Promise<unknown>
}

/** Owns one root, its input queue, DOM projection, and effects. No work runs at import. */
export function createPlayer(host: HTMLElement, initial: { puzzle: Puzzle; progress: Progress | null },
  configuration: PlayerConfiguration, environment: {
    assets: () => PlayerAssets
    css: string | null
    titleChanged: (title: string) => void
  },
): PlayerInstance {
  let id: string
  // Separate copies of this module can coexist in one document too.
  do { id = `cross-player-${++nextInstance}` } while (document.getElementById(id) !== null)
  const element = document.createElement('div')
  element.id = id
  element.className = 'cross-player'
  const app = document.createElement('div')
  app.className = 'cross-surface'
  if (environment.css !== null) {
    const style = document.createElement('style')
    style.textContent = `@scope (#${id}) to (.cross-player) { ${environment.css} }`
    element.append(style)
  }
  element.append(app)
  host.append(element)
  const lifecycle = new AbortController()
  const listenerOptions = { signal: lifecycle.signal }
  let destroyed = false
  const downloads: { url: string; timeout: ReturnType<typeof setTimeout> }[] = []
  function required<T extends Element>(selector: string, type: { new(...args: never[]): T }): T {
    const node = app.querySelector(selector)
    if (!(node instanceof type)) throw new Error(`Missing ${selector}`)
    return node
  }
  const { library, brand, storageKey } = configuration
  const standalone = configuration.mode === 'standalone'
  const initialPuzzle = library.find(entry => entry.puzzle.id === initial.puzzle.id)?.puzzle ?? initial.puzzle
  const { puzzleHistory, puzzlePath, resolvePuzzleLocation } = createNavigation(library, initialPuzzle, location.pathname)
  app.dataset['chrome'] = configuration.chrome
  app.innerHTML = `
    <header class="cross-site-header" data-cross-part="header"${configuration.chrome === "puzzle" ? " hidden" : ""}>
      <a class="cross-brand" href="/" aria-label="Crossword home"><span class="cross-brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span><span class="cross-brand-name"></span><span class="cross-brand-period">.</span></a>
      <nav aria-label="Puzzle navigation"><button class="cross-text-button cross-library-button" data-command="panel:library" aria-label="Puzzles">${icon('grid')}<span>Puzzles</span></button><span class="cross-nav-divider"></span><button class="cross-text-button" data-command="import" aria-label="Open puzzle">${icon('upload')}<span>Open puzzle</span></button><button class="cross-icon-button" data-command="panel:help" aria-label="How to play">${icon('help')}</button></nav>
    </header>
    <div class="cross-workspace" data-cross-part="workspace">
      <section class="cross-puzzle-heading" data-cross-part="heading" aria-labelledby="puzzle-title"><div><div data-cross-id="puzzle-size" class="cross-eyebrow"></div><h1 data-cross-id="puzzle-title"></h1><p class="cross-byline">By <span data-cross-id="puzzle-author"></span><span class="cross-byline-separator">·</span><span data-cross-id="puzzle-description"></span></p></div><div class="cross-puzzle-heading-actions"><button data-cross-id="copy-link" class="cross-text-button" data-command="copy-link" aria-label="Copy puzzle link">${icon('link',18)}<span>Copy link</span></button><button class="cross-icon-button" data-command="panel:download" aria-label="Save puzzle" title="Save puzzle">${icon('upload')}</button><button class="cross-icon-button cross-settings-top" data-command="panel:settings" aria-label="Player settings">${icon('settings')}</button></div></section>
      <div class="cross-game-toolbar" data-cross-part="toolbar"><div class="cross-solve-stats"><button data-cross-id="timer-button" class="cross-timer-button" data-command="pause" aria-label="Pause puzzle"><span data-cross-id="timer-icon">${icon('pause',16)}</span><span data-cross-id="timer">0:00</span></button><span class="cross-toolbar-divider"></span><span data-cross-id="progress-label">0 / 21</span></div><div class="cross-tools"><button data-cross-id="pencil" aria-label="Pencil mode" class="cross-tool-button" data-command="pencil" aria-pressed="false">${icon('pencil',18)}<span>Pencil</span></button><button class="cross-tool-button" aria-label="Check answers" data-command="panel:check">${icon('check',18)}<span>Check</span></button><button class="cross-tool-button" aria-label="Reveal answers" data-command="panel:reveal">${icon('eye',18)}<span>Reveal</span></button><button class="cross-icon-button cross-settings-mobile" data-command="panel:settings" aria-label="Player settings">${icon('settings',18)}</button></div></div>
      <div class="cross-play-layout" data-cross-part="layout">
        <section class="cross-board-column" aria-label="Crossword puzzle">
          <div class="cross-active-clue cross-desktop-clue" data-cross-part="active-clue"><span data-cross-id="clue-label" class="cross-clue-badge"></span><p data-cross-id="clue-text"></p><span data-cross-id="clue-length" class="cross-clue-length"></span><button class="cross-icon-button" data-command="toggle-direction" aria-label="Switch across or down">${icon('swap',18)}</button></div>
          <div class="cross-grid-space"><div class="cross-board-wrap"><div data-cross-id="board" class="cross-board" data-cross-part="grid" role="grid" tabindex="0" aria-label="Crossword grid. Type letters; arrows move; Space changes direction; Tab changes clue; Escape leaves the grid."></div><div data-cross-id="pause-cover" class="cross-pause-cover" hidden><span class="cross-pause-symbol">${icon('pause',36)}</span><h2>Paused</h2><button class="cross-primary-button" data-command="resume">${icon('play',18)}Resume puzzle</button></div></div><div class="cross-grid-details">
          <div class="cross-board-caption"><span data-cross-id="save-status"><span class="cross-status-dot"></span>Saved on this device</span><div class="cross-board-caption-tools"><button data-cross-id="zoom-button" class="cross-text-button cross-mobile-list-button" data-command="zoom" aria-pressed="false">Zoom grid</button><button class="cross-text-button cross-mobile-list-button" data-command="panel:clues">All clues</button></div><button class="cross-text-button cross-desktop-shortcuts" data-command="panel:help">Shortcuts <span aria-hidden="true">↗</span></button></div>
          <div data-cross-id="hint-card" class="cross-hint-card"><div class="cross-hint-heading">${icon('bulb',19)}<span>Hint</span></div><p data-cross-id="hint-text">Stuck on a clue? Get a nudge without revealing the answer.</p><button data-cross-id="hint-button" class="cross-hint-button" data-command="hint">Get a hint <span aria-hidden="true">↗</span></button></div>
          </div></div>
        </section>
        <section data-cross-id="clue-lists" class="cross-clue-lists" data-cross-part="clues" aria-label="Clues"><div class="cross-clue-column"><h2><span>Across</span><span class="cross-direction-arrow" aria-hidden="true">→</span></h2><div data-cross-id="across-clues" class="cross-clue-scroll"></div></div><div class="cross-clue-column"><h2><span>Down</span><span class="cross-direction-arrow" aria-hidden="true">↓</span></h2><div data-cross-id="down-clues" class="cross-clue-scroll"></div></div></section>
      </div>
    </div>
    <div class="cross-mobile-dock" data-cross-part="mobile-dock"><div class="cross-mobile-clue"><button class="cross-icon-button" data-command="previous" aria-label="Previous clue">${icon('left')}</button><button data-cross-id="mobile-clue-switch" class="cross-mobile-clue-content" data-command="toggle-direction"><span data-cross-id="mobile-clue-label"></span><span data-cross-id="mobile-clue-text"></span></button><button class="cross-icon-button" data-command="next" aria-label="Next clue">${icon('right')}</button></div><div data-cross-id="keyboard" class="cross-keyboard" data-cross-part="keyboard" aria-label="On-screen keyboard"></div><div class="cross-mobile-hint"><button class="cross-text-button" data-command="hint">${icon('bulb',15)}Hint</button><span data-cross-id="mobile-save-status">Saved on this device</span></div></div>
    <dialog data-cross-id="dialog" data-cross-part="dialog" aria-labelledby="dialog-title"><div class="cross-dialog-header"><h2 data-cross-id="dialog-title"></h2><button class="cross-icon-button" data-command="close" aria-label="Close dialog">${icon('close')}</button></div>
      <section data-cross-id="clue-panel" class="cross-clue-panel" data-panel="clues"></section>
      <section data-panel="library"><p data-cross-id="library-intro" class="cross-dialog-intro">Pick a puzzle, or bring one of your own.</p><div data-cross-id="puzzle-library"></div><button class="cross-secondary-button cross-wide" data-command="import">${icon('upload')}Open .puz, HTML, or crossword JSON</button><p class="cross-dialog-note">Files stay on your device.</p></section>
      <section data-panel="download"><button class="cross-secondary-button cross-wide" data-command="import">Open another puzzle</button><div class="cross-scope-buttons"><button data-command="download:puz">Download .puz</button><button data-command="download:html">Download playable HTML</button><button data-command="download:progress">HTML with my progress</button></div><p class="cross-dialog-note">HTML includes the player and works offline, using your system fonts. Open it in a browser to play or load another .puz.</p><p class="cross-dialog-note">Experimental: the HTML file can also be renamed to .puz for readers such as puzpy that search for its puzzle header. Use Download .puz for other apps.</p><p class="cross-dialog-note">The .puz download preserves an imported file as supplied. Your progress in this player is included only in HTML with my progress.</p></section>
      <section data-panel="share"><p class="cross-dialog-intro">Copy this link to share the puzzle. Each person keeps their own progress.</p><input data-cross-id="share-link" class="cross-share-link" type="url" readonly aria-label="Puzzle link"><p class="cross-dialog-note">Automatic copying is unavailable. Select and copy the link above.</p></section>
      <section data-panel="help"><p class="cross-dialog-intro">Select a square and start typing. Select it again to switch between across and down.</p><dl class="cross-shortcuts"><div><dt>Arrow keys</dt><dd>Change direction, then move</dd></div><div><dt>Space / Enter</dt><dd>Switch across and down</dd></div><div><dt>Tab / Shift Tab</dt><dd>Next / previous clue</dd></div><div><dt>Backspace</dt><dd>Erase, then move back</dd></div><div><dt>Escape</dt><dd>Leave the grid for other controls</dd></div></dl><p class="cross-dialog-intro">On a phone, use the keyboard below the grid. Tap the clue to change direction, or the arrows to choose another clue.</p><p class="cross-dialog-note">Hints offer another way to think about a clue. Check marks incorrect letters; Reveal fills in an answer. All are here to help.</p></section>
      <section data-panel="settings"><div class="cross-setting"><div><strong>Skip filled squares</strong><p>Move to the next empty square as you type.</p></div><button class="cross-switch" role="switch" data-command="setting:skipFilled" aria-label="Skip filled squares"></button></div><div class="cross-setting"><div><strong>Advance to the next clue</strong><p>Keep going when an answer is filled.</p></div><button class="cross-switch" role="switch" data-command="setting:advanceWord" aria-label="Advance to the next clue"></button></div><div class="cross-setting"><div><strong>Show timer</strong><p>For when you like to keep track.</p></div><button class="cross-switch" role="switch" data-command="setting:showTimer" aria-label="Show timer"></button></div><button class="cross-secondary-button cross-wide" data-command="panel:restart">Start over</button></section>
      <section data-panel="check"><p class="cross-dialog-intro">Incorrect letters get a small red mark. Nothing is erased.</p><div class="cross-scope-buttons"><button data-command="check:cell">Check square</button><button data-command="check:word">Check word</button><button data-command="check:puzzle">Check puzzle</button></div></section>
      <section data-panel="reveal"><p class="cross-dialog-intro">Fill in the solution for a square, a word, or the whole puzzle. Revealed letters keep a small blue corner.</p><div class="cross-scope-buttons"><button data-command="reveal:cell">Reveal square</button><button data-command="reveal:word">Reveal word</button><button data-command="reveal:puzzle">Reveal puzzle…</button></div><div data-cross-id="reveal-confirm" hidden><p>Reveal every remaining answer?</p><button class="cross-primary-button cross-wide" data-command="reveal-all-confirmed">Reveal the full puzzle</button></div></section>
      <section data-panel="restart"><p class="cross-dialog-intro">Clear your letters and reset the timer for this puzzle?</p><button class="cross-primary-button cross-wide" data-command="restart">Start fresh</button><button class="cross-text-button cross-wide" data-command="close">Keep solving</button></section>
      <section data-panel="complete" class="cross-completion"><div class="cross-completion-mark">${icon('check',38)}</div><h3>Puzzle complete</h3><p data-cross-id="completion-detail"></p><button class="cross-primary-button cross-wide" data-command="next-puzzle">Another puzzle ${icon('right',18)}</button><button class="cross-text-button cross-wide" data-command="close">Close</button></section>
    </dialog>
    <input data-cross-id="puzzle-file" type="file" accept=".puz,.html,.htm,.json" hidden>
    <div data-cross-id="toast" class="cross-toast" role="status" aria-live="polite" hidden></div>
    <div data-cross-id="announcement" class="cross-sr-only" aria-live="polite" aria-atomic="true"></div>
  `

  for (const node of app.querySelectorAll<HTMLElement>('[data-cross-id]')) node.id = `${id}-${node.dataset['crossId']!}`
  for (const node of app.querySelectorAll('[aria-labelledby]')) node.setAttribute('aria-labelledby', `${id}-${node.getAttribute('aria-labelledby')!}`)
  // Avoid submitting a form that contains the mount.
  for (const button of app.querySelectorAll('button')) button.type = 'button'

  // DOM nodes have instance/puzzle lifetimes and stay out of serializable solving state.
  const dom = {
    board: required('[data-cross-id="board"]', HTMLDivElement), title: required('[data-cross-id="puzzle-title"]', HTMLHeadingElement),
    boardWrap: required('.cross-board-wrap', HTMLDivElement), dock: required('.cross-mobile-dock', HTMLDivElement),
    boardColumn: required('.cross-board-column', HTMLElement),
    gridSpace: required('.cross-grid-space', HTMLDivElement), playLayout: required('.cross-play-layout', HTMLDivElement),
    gridDetails: required('.cross-grid-details', HTMLDivElement),
    clueLists: required('[data-cross-id="clue-lists"]', HTMLElement), cluePanel: required('[data-cross-id="clue-panel"]', HTMLElement),
    mobileHint: required('.cross-mobile-hint', HTMLDivElement),
    zoom: required('[data-cross-id="zoom-button"]', HTMLButtonElement),
    saveStatus: required('[data-cross-id="save-status"]', HTMLSpanElement), mobileSaveStatus: required('[data-cross-id="mobile-save-status"]', HTMLSpanElement),
    author: required('[data-cross-id="puzzle-author"]', HTMLSpanElement), description: required('[data-cross-id="puzzle-description"]', HTMLSpanElement),
    size: required('[data-cross-id="puzzle-size"]', HTMLDivElement), timer: required('[data-cross-id="timer"]', HTMLSpanElement),
    timerButton: required('[data-cross-id="timer-button"]', HTMLButtonElement), timerIcon: required('[data-cross-id="timer-icon"]', HTMLSpanElement),
    progress: required('[data-cross-id="progress-label"]', HTMLSpanElement), pencil: required('[data-cross-id="pencil"]', HTMLButtonElement),
    clueLabel: required('[data-cross-id="clue-label"]', HTMLSpanElement), clueText: required('[data-cross-id="clue-text"]', HTMLParagraphElement),
    clueLength: required('[data-cross-id="clue-length"]', HTMLSpanElement), mobileLabel: required('[data-cross-id="mobile-clue-label"]', HTMLSpanElement),
    mobileText: required('[data-cross-id="mobile-clue-text"]', HTMLSpanElement), hintText: required('[data-cross-id="hint-text"]', HTMLParagraphElement),
    hintButton: required('[data-cross-id="hint-button"]', HTMLButtonElement), hintCard: required('[data-cross-id="hint-card"]', HTMLDivElement),
    pauseCover: required('[data-cross-id="pause-cover"]', HTMLDivElement), dialog: required('[data-cross-id="dialog"]', HTMLDialogElement),
    dialogTitle: required('[data-cross-id="dialog-title"]', HTMLHeadingElement), file: required('[data-cross-id="puzzle-file"]', HTMLInputElement),
    across: required('[data-cross-id="across-clues"]', HTMLDivElement), down: required('[data-cross-id="down-clues"]', HTMLDivElement),
    toast: required('[data-cross-id="toast"]', HTMLDivElement), announcement: required('[data-cross-id="announcement"]', HTMLDivElement),
    completionDetail: required('[data-cross-id="completion-detail"]', HTMLParagraphElement),
    copyLink: required('[data-cross-id="copy-link"]', HTMLButtonElement), shareLink: required('[data-cross-id="share-link"]', HTMLInputElement),
    libraryIntro: required('[data-cross-id="library-intro"]', HTMLParagraphElement),
    cells: [] as { node: HTMLDivElement; letter: HTMLSpanElement }[], // lifetime: loaded puzzle
    clues: [] as HTMLButtonElement[], // lifetime: loaded puzzle
    panels: [...app.querySelectorAll<HTMLElement>('[data-panel]')],
    switches: [...app.querySelectorAll<HTMLButtonElement>('.cross-switch')],
  }

  let puzzle = initialPuzzle
  let progress = newProgress(puzzle)
  const st = {
    selection: { cell: puzzle.entries[0]!.cells[0]!, direction: 'across' } as Selection,
    preferences: { ...defaultPreferences }, pencil: false, panel: null as Panel,
    mode: 'ready' as 'ready' | 'running' | 'paused' | 'complete',
    startedAt: 0, message: '', messageUntil: 0, revealConfirm: false,
    events: [] as Action[], zoom: false,
    storageAvailable: true,
    missingPuzzle: false, shareUrl: '',
  }
  let scheduled: number | null = null
  let clockTimeout: ReturnType<typeof setTimeout> | null = null
  let saveTimeout: ReturnType<typeof setTimeout> | null = null
  let pendingSave = false
  let focusBoard = false
  let scrollClue = false
  let requestFile = false
  let leaveGrid = false
  let renderedPuzzle: Puzzle | null = null
  let pendingHistory: 'push' | 'replace' | null = null
  let pendingCopyPath: string | null = null
  let selectShareLink = false
  let pendingDownload: 'puz' | 'html' | 'progress' | null = null

  function notify(message: string): void {
    st.message = message
    st.messageUntil = performance.now() + 4200
  }

  function restore(p: Puzzle, snapshot: Progress | null = null): Progress {
    try {
      const raw = localStorage.getItem(`${storageKey}:progress:${p.id}`)
      if (raw === null) return snapshot ?? newProgress(p)
      const data: unknown = JSON.parse(raw)
      const result = parseProgress(data, p)
      if (result.ok) return result.value
      notify(result.error)
    } catch {
      notify('Saved progress could not be read. You can still solve here.')
    }
    return snapshot ?? newProgress(p)
  }

  function elapsed(now: number): number {
    return progress.elapsedMs + (st.mode === 'running' ? Math.max(0, now - st.startedAt) : 0)
  }

  function save(now: number): void {
    try {
      localStorage.setItem(`${storageKey}:progress:${puzzle.id}`, serializeProgress(puzzle, { ...progress, elapsedMs: elapsed(now) }))
      localStorage.setItem(`${storageKey}:preferences`, JSON.stringify(st.preferences))
      localStorage.setItem(`${storageKey}:last-puzzle`, JSON.stringify(puzzleFile(puzzle)))
      if (!st.storageAvailable) { st.storageAvailable = true; schedule() }
    } catch {
      st.storageAvailable = false
      notify('Storage is unavailable. Keep this tab open to preserve your progress.')
      schedule()
    }
  }

  function load(next: Puzzle, now: number, history: 'push' | null = 'push', snapshot: Progress | null = null): void {
    save(now)
    puzzle = next
    progress = snapshot ?? restore(next)
    st.selection = selectEntry(next.entries[0]!, progress, true)
    st.mode = isSolved(next, progress) ? 'complete' : 'ready'
    st.pencil = false
    st.panel = null
    st.revealConfirm = false
    st.zoom = false
    st.missingPuzzle = false
    pendingHistory = history
    pendingSave = true
    focusBoard = true
    scrollClue = true
  }

  function start(now: number): void {
    if (st.mode === 'ready' || st.mode === 'paused') { st.mode = 'running'; st.startedAt = now }
  }

  function pause(now: number): void {
    if (st.mode !== 'running') return
    progress.elapsedMs = elapsed(now)
    st.mode = 'paused'
    pendingSave = true
  }

  function schedule(): void {
    if (destroyed) return
    scheduled ??= requestAnimationFrame(render)
  }

  function dispatch(action: Action): void {
    if (destroyed) return
    st.events.push(action)
    schedule()
  }

  function formatTime(ms: number): string {
    const seconds = Math.floor(ms / 1000)
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  }

  function command(value: string, now: number): void {
    if (value.startsWith('letter:')) { key(value.slice(7), false, now); return }
    if (value.startsWith('panel:')) {
      const panel = value.slice(6)
      switch (panel) {
        case 'library': case 'help': case 'settings': case 'check': case 'reveal': case 'restart': case 'clues': case 'download':
          st.panel = panel; st.revealConfirm = false; return
        default: throw new Error('Unknown panel')
      }
    }
    if (value.startsWith('setting:')) {
      const name = value.slice(8)
      switch (name) {
        case 'skipFilled': case 'advanceWord': case 'showTimer':
          st.preferences[name] = !st.preferences[name]; pendingSave = true; return
        default: throw new Error('Unknown preference')
      }
    }
    if (value.startsWith('check:') || value.startsWith('reveal:') || value === 'reveal-all-confirmed') {
      const reveal = value.startsWith('reveal')
      const scope = value.split(':')[1] ?? 'puzzle'
      if (reveal && scope === 'puzzle' && value !== 'reveal-all-confirmed') { st.revealConfirm = true; return }
      const cells = scope === 'cell' ? [st.selection.cell] : scope === 'word' ? entryAt(puzzle, st.selection).cells : puzzle.cells.map((_, i) => i)
      start(now)
      const affected = checkCells(puzzle, progress, cells, reveal)
      notify(reveal ? `${affected} ${affected === 1 ? 'letter' : 'letters'} revealed.` : affected > 0 ? `${affected} ${affected === 1 ? 'letter needs' : 'letters need'} another look.` : 'No incorrect letters in the filled squares.')
      st.panel = null; pendingSave = true; focusBoard = true
      return
    }
    switch (value) {
      case 'close': st.panel = null; focusBoard = true; scrollClue = true; break
      case 'import': requestFile = true; break
      case 'download:puz': pendingDownload = 'puz'; break
      case 'download:html': pendingDownload = 'html'; break
      case 'download:progress': pendingDownload = 'progress'; break
      case 'copy-link': pendingCopyPath = puzzlePath(puzzle); break
      case 'pause':
        if (st.mode === 'running') pause(now)
        else if (st.mode !== 'complete') start(now)
        focusBoard = true; break
      case 'resume': start(now); focusBoard = true; break
      case 'pencil': st.pencil = !st.pencil; focusBoard = true; break
      case 'erase': key('Backspace', false, now); break
      case 'toggle-direction':
        st.selection.direction = st.selection.direction === 'across' ? 'down' : 'across'
        focusBoard = true; scrollClue = true; break
      case 'next': case 'previous':
        st.selection = selectEntry(nextEntry(puzzle, entryAt(puzzle, st.selection), value === 'next' ? 1 : -1), progress, st.preferences.skipFilled)
        focusBoard = true; scrollClue = true; break
      case 'hint': {
        const entry = entryAt(puzzle, st.selection)
        if (entry.clue.hint === '') { notify('This puzzle has no extra hints. Check or Reveal can help.'); break }
        const index = puzzle.entries.indexOf(entry)
        if (!progress.hints.includes(index)) progress.hints.push(index)
        progress.assisted = true
        pendingSave = true
        notify(entry.clue.hint)
        break
      }
      case 'restart':
        progress = newProgress(puzzle); st.selection = selectEntry(puzzle.entries[0]!, progress, false)
        st.mode = 'ready'; st.panel = null; st.pencil = false; pendingSave = true; focusBoard = true; scrollClue = true
        break
      case 'next-puzzle': load(library[(library.findIndex(entry => entry.puzzle.id === puzzle.id) + 1) % library.length]!.puzzle, now); break
      case 'zoom': st.zoom = !st.zoom; scrollClue = true; break
      default: throw new Error(`Unknown command: ${value}`)
    }
  }

  function key(value: string, shift: boolean, now: number): void {
    if (value === 'Escape') { leaveGrid = true; return }
    switch (value) {
      case ' ': case 'Enter': command('toggle-direction', now); return
      case 'Tab': command(shift ? 'previous' : 'next', now); return
      case 'ArrowLeft': case 'ArrowRight': case 'ArrowUp': case 'ArrowDown':
        st.selection = moveArrow(puzzle, st.selection, value); scrollClue = true; return
      default: break
    }
    if (st.mode === 'complete' || st.mode === 'paused') return
    if (/^[a-zA-Z]$/.test(value)) {
      start(now)
      progress.fills[st.selection.cell] = { letter: value.toUpperCase(), pencil: st.pencil, mark: 'none' }
      st.selection = nextAfterLetter(puzzle, progress, st.selection, st.preferences)
    } else if (value === 'Backspace') {
      start(now); st.selection = erase(puzzle, progress, st.selection)
    } else if (value === 'Delete') {
      start(now); progress.fills[st.selection.cell] = emptyFill()
    } else return
    pendingSave = true; focusBoard = true; scrollClue = true
  }

  function buildPuzzleDom(): void {
    dom.cells = []
    dom.clues = []
    dom.board.replaceChildren()
    dom.across.replaceChildren()
    dom.down.replaceChildren()
    dom.board.style.setProperty('--columns', String(puzzle.width))
    dom.board.style.setProperty('--rows', String(puzzle.height))
    dom.clueLists.style.setProperty('--clue-number-width', `${Math.max(2, String(puzzle.entries[puzzle.entries.length - 1]!.number).length)}ch`)
    dom.board.setAttribute('aria-rowcount', String(puzzle.height))
    dom.board.setAttribute('aria-colcount', String(puzzle.width))
    const starts = puzzle.entries.map(entry => entry.cells[0]!)
    for (let row = 0; row < puzzle.height; row++) {
      const rowNode = document.createElement('div')
      rowNode.className = 'cross-grid-row'; rowNode.setAttribute('role', 'row')
      for (let col = 0; col < puzzle.width; col++) {
        const index = row * puzzle.width + col
        const cell = puzzle.cells[index]!
        const node = document.createElement('div')
        node.id = `${id}-cell-${index}`; node.dataset['cell'] = String(index); node.dataset['crossPart'] = 'cell'
        node.setAttribute('role', 'gridcell'); node.setAttribute('aria-colindex', String(col + 1))
        node.setAttribute('aria-rowindex', String(row + 1))
        const number = document.createElement('span')
        number.className = 'cross-cell-number'; number.setAttribute('aria-hidden', 'true')
        const start = starts.indexOf(index)
        number.textContent = start === -1 ? '' : String(puzzle.entries[start]!.number)
        const letter = document.createElement('span')
        letter.className = 'cross-cell-letter'; letter.setAttribute('aria-hidden', 'true')
        if (cell.kind === 'letter' && cell.circled) { const circle = document.createElement('span'); circle.className = 'cross-cell-circle'; node.append(circle) }
        node.append(number, letter)
        rowNode.append(node)
        dom.cells.push({ node, letter })
      }
      dom.board.append(rowNode)
    }
    for (let i = 0; i < puzzle.entries.length; i++) {
      const entry = puzzle.entries[i]!
      const button = document.createElement('button'); button.type = 'button'
      button.className = 'cross-clue-row'; button.dataset['entry'] = String(i); button.dataset['crossPart'] = 'clue'
      const number = document.createElement('span'); number.className = 'cross-clue-number'; number.textContent = String(entry.number)
      const text = document.createElement('span'); text.className = 'cross-clue-copy'; text.textContent = entry.clue.text
      const length = document.createElement('span'); length.className = 'cross-entry-length'; length.textContent = String(entry.cells.length)
      button.append(number, text, length)
      ;(entry.direction === 'across' ? dom.across : dom.down).append(button)
      dom.clues.push(button)
    }
    renderedPuzzle = puzzle
  }

  function render(now: number): void {
    scheduled = null
    // Read browser state before applying input and writing the DOM.
    const viewportWidth = element.clientWidth
    const mobile = viewportWidth <= 760
    const columnWidth = mobile ? dom.boardColumn.clientWidth : Math.min(510,
      (dom.playLayout.clientWidth - Number.parseFloat(getComputedStyle(dom.playLayout).columnGap)) / 2)
    const gridSpaceHeight = dom.gridSpace.getBoundingClientRect().height - dom.gridDetails.getBoundingClientRect().height
    const clueListsParent = dom.clueLists.parentElement
    const dockHeight = dom.dock.offsetHeight
    const gridScrollLeft = dom.boardWrap.scrollLeft
    const gridScrollTop = dom.boardWrap.scrollTop
    const previousEntry = entryAt(puzzle, st.selection)
    const previousPanel = st.panel
    const actions = st.events.splice(0)
    const agentReplies: { resolve: (result: unknown) => void; error: string | null }[] = []
    for (const action of actions) {
      switch (action.type) {
        case 'command': command(action.command, now); break
        case 'key': key(action.key, action.shift, now); break
        case 'cell':
          if (puzzle.cells[action.index]?.kind !== 'letter' || st.mode === 'paused') break
          if (st.selection.cell === action.index) command('toggle-direction', now)
          else st.selection.cell = action.index
          focusBoard = true; scrollClue = true; break
        case 'entry': {
          const entry = puzzle.entries[action.index]
          if (entry === undefined) break
          st.selection = selectEntry(entry, progress, st.preferences.skipFilled)
          st.panel = null
          focusBoard = true; scrollClue = true; break
        }
        case 'import': load(action.puzzle, now, 'push', action.progress); break
        case 'error': st.panel = null; notify(action.message); break
        case 'downloaded': notify('Download started. Check your downloads folder.'); break
        case 'visibility': if (action.hidden) pause(now); break
        case 'layout': scrollClue = true; break
        case 'navigate': {
          const destination = resolvePuzzleLocation(action.search, action.historyState, null)
          load(destination.puzzle, now, action.source === 'link' ? 'push' : null)
          st.missingPuzzle = destination.missing
          if (destination.missing) { st.panel = 'library'; pendingHistory = null }
          break
        }
        case 'copy-result':
          if (action.copied) notify('Puzzle link copied.')
          else { st.shareUrl = action.url; st.panel = 'share'; selectShareLink = true }
          break
        case 'agent': {
          let error: string | null = null
          switch (action.request.type) {
            case 'read': break
            case 'select': {
              const request = action.request
              const entry = puzzle.entries.find(candidate => candidate.number === request.number && candidate.direction === request.direction)
              if (entry === undefined) error = 'That clue is not in this puzzle.'
              else { st.selection = selectEntry(entry, progress, st.preferences.skipFilled); focusBoard = true; scrollClue = true }
              break
            }
            case 'type':
              if (st.mode === 'paused' || st.mode === 'complete' || st.panel !== null) error = 'Resume the puzzle and close any dialog before typing.'
              else for (const letter of action.request.letters) key(letter, false, now)
              break
          }
          agentReplies.push({ resolve: action.resolve, error })
          break
        }
      }
    }
    if (st.mode !== 'complete' && isSolved(puzzle, progress)) {
      progress.elapsedMs = elapsed(now); st.mode = 'complete'; st.panel = 'complete'; pendingSave = true
    }
    if (st.mode === 'running' && filledCount(puzzle, progress) === puzzle.cells.filter(c => c.kind === 'letter').length && pendingSave && st.panel !== 'complete') {
      notify('The grid is full. A few letters still need another look.')
    }
    const entry = entryAt(puzzle, st.selection)
    const selectedEntry = puzzle.entries.indexOf(entry)
    const hintUsed = progress.hints.includes(selectedEntry)
    const label = `${entry.number}${entry.direction === 'across' ? 'A' : 'D'}`
    const time = formatTime(elapsed(now))
    const cluePane = entry.direction === 'across' ? dom.across : dom.down
    let nextClueScroll: number | null = null
    if (scrollClue && !mobile && renderedPuzzle === puzzle && clueListsParent === dom.playLayout) {
      const clue = dom.clues[selectedEntry]!
      nextClueScroll = revealScrollOffset(cluePane.scrollTop, cluePane.clientHeight, clue.offsetTop, clue.offsetHeight)
    }
    // All DOM projection follows state changes. Grid geometry follows one size.
    const puzzleChanged = renderedPuzzle !== puzzle
    if (puzzleChanged) buildPuzzleDom()
    const clueListsTarget = st.panel === 'clues' ? dom.cluePanel : dom.playLayout
    if (clueListsParent !== clueListsTarget) clueListsTarget.append(dom.clueLists)
    app.className = `cross-surface ${st.mode === 'paused' ? 'cross-is-paused' : ''} ${st.mode === 'complete' ? 'is-complete' : ''}`
    const zoomed = st.zoom
    const boardWidth = mobile ? columnWidth : desktopGridWidth(columnWidth, gridSpaceHeight, puzzle.width, puzzle.height)
    const renderedWidth = zoomed ? zoomGridWidth(boardWidth, puzzle.width) : boardWidth
    const typography = gridTypography(renderedWidth, puzzle.width)
    dom.boardWrap.className = `cross-board-wrap${zoomed ? ' cross-is-zoomed' : ''}`
    dom.boardWrap.style.width = `${boardWidth}px`
    dom.gridDetails.style.width = `${boardWidth}px`
    dom.playLayout.style.setProperty('--grid-width', `${boardWidth}px`)
    dom.boardWrap.style.aspectRatio = `${puzzle.width} / ${puzzle.height}`
    dom.board.style.width = `${renderedWidth}px`
    element.style.setProperty('--keyboard-height', `${dockHeight}px`)
    dom.zoom.textContent = st.zoom ? 'Fit grid' : 'Zoom grid'
    dom.zoom.setAttribute('aria-pressed', String(st.zoom))
    dom.board.style.setProperty('--letter-size', `${typography.letter}px`)
    dom.board.style.setProperty('--number-size', `${typography.number}px`)
    dom.board.style.setProperty('--letter-inset', `${typography.inset}px`)
    dom.title.textContent = puzzle.title
    environment.titleChanged(`${puzzle.title} | ${brand}`)
    dom.copyLink.hidden = standalone || location.protocol === 'file:' || puzzlePath(puzzle) === null || st.missingPuzzle
    dom.shareLink.value = st.shareUrl
    dom.libraryIntro.textContent = st.missingPuzzle ? 'That puzzle link is not in the library. Choose a puzzle below.' : 'Pick a puzzle, or bring one of your own.'
    dom.author.textContent = puzzle.author
    dom.description.textContent = puzzle.description
    dom.size.textContent = `${puzzle.width} × ${puzzle.height} CROSSWORD`
    dom.timer.textContent = st.preferences.showTimer ? time : 'Timer off'
    dom.saveStatus.textContent = st.storageAvailable ? 'Saved on this device' : 'Progress is not being saved'
    dom.mobileSaveStatus.textContent = st.storageAvailable ? 'Saved on this device' : 'Not saved'
    dom.timerButton.setAttribute('aria-label', st.mode === 'running' ? 'Pause puzzle' : 'Resume puzzle')
    dom.timerButton.disabled = st.mode === 'complete'
    const timerSymbol = st.mode === 'running' ? 'pause' : 'play'
    if (dom.timerIcon.dataset['symbol'] !== timerSymbol) {
      dom.timerIcon.innerHTML = icon(timerSymbol, 16)
      dom.timerIcon.dataset['symbol'] = timerSymbol
    }
    dom.progress.textContent = `${filledCount(puzzle, progress)} / ${puzzle.cells.filter(c => c.kind === 'letter').length}`
    dom.pencil.setAttribute('aria-pressed', String(st.pencil))
    dom.clueLabel.textContent = label
    dom.clueText.textContent = entry.clue.text
    dom.clueLength.textContent = String(entry.cells.length)
    dom.mobileLabel.textContent = `${entry.number} ${entry.direction}`
    dom.mobileText.textContent = entry.clue.text
    dom.hintText.textContent = hintUsed ? entry.clue.hint : 'Stuck on a clue? Get a nudge without revealing the answer.'
    dom.hintButton.textContent = hintUsed ? 'Hint shown ✓' : 'Get a hint ↗'
    dom.hintButton.disabled = hintUsed
    dom.hintCard.hidden = entry.clue.hint === '' || st.mode === 'paused'
    dom.mobileHint.hidden = entry.clue.hint === ''
    dom.pauseCover.hidden = st.mode !== 'paused'
    dom.board.inert = st.mode === 'paused'
    dom.board.setAttribute('aria-activedescendant', `${id}-cell-${st.selection.cell}`)
    dom.board.setAttribute('aria-hidden', String(st.mode === 'paused'))
    for (let i = 0; i < puzzle.cells.length; i++) {
      const cell = puzzle.cells[i]!
      const { node, letter } = dom.cells[i]!
      const fill = progress.fills[i]!
      const active = i === st.selection.cell
      node.className = `cross-cell${cell.kind === 'block' ? ' cross-block' : ''}${active ? ' cross-selected' : entry.cells.includes(i) ? ' cross-word-selected' : ''}${fill.pencil ? ' cross-pencilled' : ''}${fill.mark === 'incorrect' ? ' cross-incorrect' : ''}${fill.mark === 'revealed' ? ' cross-revealed' : ''}`
      letter.textContent = st.mode === 'paused' ? '' : fill.letter
      node.setAttribute('aria-selected', String(active))
      node.setAttribute('aria-label', cell.kind === 'block' ? 'Block' : `Row ${Math.floor(i / puzzle.width) + 1}, column ${i % puzzle.width + 1}, ${fill.letter === '' ? 'empty' : fill.letter}${fill.pencil ? ', pencil' : ''}${fill.mark === 'incorrect' ? ', incorrect' : ''}`)
    }
    for (let i = 0; i < puzzle.entries.length; i++) {
      const current = puzzle.entries[i]!
      const complete = current.cells.every(cell => progress.fills[cell]!.letter !== '')
      dom.clues[i]!.className = `cross-clue-row${current === entry ? ' cross-active' : ''}${complete ? ' cross-filled' : ''}`
      dom.clues[i]!.setAttribute('aria-current', String(current === entry))
    }
    for (const toggle of dom.switches) {
      const setting = toggle.dataset['command']?.slice(8)
      switch (setting) {
        case 'skipFilled': case 'advanceWord': case 'showTimer': toggle.setAttribute('aria-checked', String(st.preferences[setting])); break
        default: throw new Error('Unknown setting')
      }
    }
    for (const panel of dom.panels) panel.hidden = panel.dataset['panel'] !== st.panel
    const panelNames = { library: 'Puzzles', help: 'How to play', settings: 'Settings', check: 'Check answers', reveal: 'Reveal answers', restart: 'Start this puzzle over?', complete: 'Puzzle complete', share: 'Share this puzzle', clues: 'All clues', download: 'Puzzle files' }
    dom.dialogTitle.textContent = st.panel === null ? '' : panelNames[st.panel]
    required('[data-cross-id="reveal-confirm"]', HTMLDivElement).hidden = !st.revealConfirm
    dom.completionDetail.textContent = `You finished ${puzzle.title}${st.preferences.showTimer ? ` in ${time}` : ''}.${progress.assisted ? ' With a little help along the way.' : ''}`
    dom.toast.hidden = st.message === '' || now >= st.messageUntil
    dom.toast.textContent = st.message
    if (previousEntry !== entry) dom.announcement.textContent = `${entry.number} ${entry.direction}. ${entry.clue.text}. ${entry.cells.length} letters.`
    // Side effects are ordered after projection.
    if (pendingHistory !== null && !standalone) {
      const destination = puzzleHistory(puzzle)
      if (pendingHistory === 'replace' || (destination.state === null && destination.path === `${location.pathname}${location.search}${location.hash}`)) history.replaceState(destination.state, '', destination.path)
      else history.pushState(destination.state, '', destination.path)
      pendingHistory = null
    }
    if (st.panel !== null && !dom.dialog.open) dom.dialog.showModal()
    if (st.panel === null && dom.dialog.open) dom.dialog.close()
    if (st.panel === 'clues' && previousPanel !== 'clues') dom.clues[selectedEntry]!.scrollIntoView({ block: 'center', behavior: 'instant' })
    if (selectShareLink) { dom.shareLink.focus(); dom.shareLink.select(); selectShareLink = false }
    if (focusBoard && st.panel === null && st.mode !== 'paused') dom.board.focus({ preventScroll: true })
    if (leaveGrid) required('[data-command="panel:download"]', HTMLButtonElement).focus({ preventScroll: true })
    if (previousEntry !== entry) dom.clueText.scrollTop = 0
    if (puzzleChanged) { dom.across.scrollTop = 0; dom.down.scrollTop = 0 }
    if (nextClueScroll !== null) cluePane.scrollTo({ top: nextClueScroll, behavior: 'instant' })
    if (scrollClue && zoomed && st.panel === null && st.mode !== 'paused') {
      const square = (renderedWidth - 4 - (puzzle.width - 1)) / puzzle.width
      const cellHeight = (renderedWidth * puzzle.height / puzzle.width - 4 - (puzzle.height - 1)) / puzzle.height
      const column = st.selection.cell % puzzle.width
      const row = Math.floor(st.selection.cell / puzzle.width)
      const first = entry.cells[0]!
      const last = entry.cells[entry.cells.length - 1]!
      const firstColumn = first % puzzle.width
      const firstRow = Math.floor(first / puzzle.width)
      const wordWidth = (last % puzzle.width - firstColumn) * (square + 1) + square
      const wordHeight = (Math.floor(last / puzzle.width) - firstRow) * (cellHeight + 1) + cellHeight
      dom.boardWrap.scrollTo({
        left: wordScrollOffset(gridScrollLeft, boardWidth, 2 + firstColumn * (square + 1), wordWidth, 2 + column * (square + 1), square),
        top: wordScrollOffset(gridScrollTop, boardWidth * puzzle.height / puzzle.width, 2 + firstRow * (cellHeight + 1), wordHeight, 2 + row * (cellHeight + 1), cellHeight),
        behavior: 'instant',
      })
    }
    if (scrollClue && mobile && st.panel === null && st.mode !== 'paused') dom.boardWrap.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
    if (requestFile) dom.file.click()
    if (pendingDownload !== null) {
      const kind = pendingDownload
      pendingDownload = null
      const snapshot = kind === 'progress' ? { ...progress, fills: progress.fills.map(fill => ({ ...fill })), hints: [...progress.hints], elapsedMs: elapsed(now) } : null
      downloadPuzzle(puzzle, kind, snapshot)
    }
    if (pendingCopyPath !== null) {
      const url = new URL(pendingCopyPath, location.origin).href
      const clipboard = (navigator as { clipboard?: Clipboard }).clipboard
      if (clipboard === undefined) dispatch({ type: 'copy-result', url, copied: false })
      else void clipboard.writeText(url).then(() => dispatch({ type: 'copy-result', url, copied: true })).catch(() => dispatch({ type: 'copy-result', url, copied: false }))
      pendingCopyPath = null
    }
    requestFile = false; focusBoard = false; scrollClue = false; leaveGrid = false
    if (pendingSave) {
      if (saveTimeout !== null) clearTimeout(saveTimeout)
      saveTimeout = setTimeout(() => { save(performance.now()); saveTimeout = null }, 180)
      pendingSave = false
    }
    if (clockTimeout !== null) clearTimeout(clockTimeout)
    if (st.mode === 'running' || now < st.messageUntil) clockTimeout = setTimeout(schedule, 250)
    for (const reply of agentReplies) {
      reply.resolve(reply.error === null ? {
        title: puzzle.title, width: puzzle.width, height: puzzle.height, mode: st.mode,
        selected: { number: entry.number, direction: entry.direction },
        filled: filledCount(puzzle, progress),
        clues: puzzle.entries.map(clue => ({ number: clue.number, direction: clue.direction, text: clue.clue.text, fill: clue.cells.map(cell => progress.fills[cell]!.letter === '' ? '_' : progress.fills[cell]!.letter).join('') })),
      } : { error: reply.error })
    }
  }

  // Event callbacks capture input. Rendering interprets it in delivery order.
  app.addEventListener('click', event => {
    if (!(event.target instanceof Element) || event.target.closest('.cross-player') !== element) return
    const puzzleLink = event.target.closest<HTMLAnchorElement>('a[data-puzzle-link]')
    if (puzzleLink !== null && app.contains(puzzleLink)) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.defaultPrevented) return
      event.preventDefault()
      dispatch({ type: 'navigate', search: new URL(puzzleLink.href).search, historyState: null, source: 'link' })
      return
    }
    const commandNode = event.target.closest<HTMLElement>('[data-command]')
    if (commandNode !== null && app.contains(commandNode)) { dispatch({ type: 'command', command: commandNode.dataset['command']! }); return }
    const cell = event.target.closest<HTMLElement>('[data-cell]')
    if (cell !== null && app.contains(cell)) { dispatch({ type: 'cell', index: Number(cell.dataset['cell']) }); return }
    const entry = event.target.closest<HTMLElement>('[data-entry]')
    if (entry !== null && app.contains(entry)) dispatch({ type: 'entry', index: Number(entry.dataset['entry']) })
  }, listenerOptions)
  dom.board.addEventListener('keydown', event => {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if (/^[a-zA-Z]$/.test(event.key) || [' ', 'Enter', 'Tab', 'Backspace', 'Delete', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault()
      dispatch({ type: 'key', key: event.key, shift: event.shiftKey })
    }
  }, listenerOptions)
  dom.dialog.addEventListener('cancel', event => { event.preventDefault(); dispatch({ type: 'command', command: 'close' }) }, listenerOptions)
  window.addEventListener('resize', () => dispatch({ type: 'layout' }), listenerOptions)
  // Clue wrapping and hints can resize the grid area or keyboard between frames.
  const layoutResize = new ResizeObserver(() => dispatch({ type: 'layout' }))
  layoutResize.observe(element)
  layoutResize.observe(dom.dock)
  layoutResize.observe(dom.gridSpace)
  layoutResize.observe(dom.gridDetails)
  if (!standalone) window.addEventListener('popstate', event => dispatch({ type: 'navigate', search: location.search, historyState: event.state, source: 'history' }), listenerOptions)
  void document.fonts.ready.then(schedule)
  document.addEventListener('visibilitychange', () => dispatch({ type: 'visibility', hidden: document.hidden }), listenerOptions)
  window.addEventListener('pagehide', flush, listenerOptions)
  dom.file.addEventListener('change', () => {
    const file = dom.file.files?.[0]
    if (file === undefined) return
    if (file.size > 5_000_000) { dispatch({ type: 'error', message: 'Please choose a puzzle smaller than 5 MB.' }); return }
    void file.arrayBuffer().then(buffer => importPuzzle(buffer, file.name)).then(result => {
      dispatch(result.ok ? { type: 'import', ...result.value } : { type: 'error', message: result.error })
    }).catch(() => dispatch({ type: 'error', message: 'This file could not be opened.' }))
    dom.file.value = ''
  }, listenerOptions)

  const keyboard = required('[data-cross-id="keyboard"]', HTMLDivElement)
  for (const [i, letters] of ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'].entries()) {
    const row = document.createElement('div'); row.className = 'cross-key-row'
    if (i === 2) row.innerHTML = `<button type="button" class="cross-key cross-key-special" data-command="toggle-direction" aria-label="Switch direction">${icon('swap',20)}</button>`
    for (const letter of letters) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'cross-key'; button.textContent = letter
      button.dataset['command'] = `letter:${letter}`; button.setAttribute('aria-label', `Type ${letter}`); row.append(button)
    }
    if (i === 2) row.insertAdjacentHTML('beforeend', `<button type="button" class="cross-key cross-key-special" data-command="erase" aria-label="Backspace">${icon('erase',22)}</button>`)
    keyboard.append(row)
  }
  required('.cross-brand-name', HTMLSpanElement).textContent = brand
  required('.cross-brand', HTMLAnchorElement).setAttribute('aria-label', `${brand} home`)
  required('.cross-brand', HTMLAnchorElement).href = configuration.homeUrl ?? (standalone ? location.href : location.pathname)
  required('.cross-brand', HTMLAnchorElement).target = configuration.homeUrl === null ? '_self' : '_top'
  required('.cross-library-button', HTMLButtonElement).hidden = standalone
  required('.cross-nav-divider', HTMLSpanElement).hidden = standalone
  required('[data-command="next-puzzle"]', HTMLButtonElement).hidden = standalone
  const libraryList = required('[data-cross-id="puzzle-library"]', HTMLDivElement)
  for (const item of library) {
    const sample = item.puzzle
    const button = document.createElement('a'); button.className = 'cross-library-item'; button.dataset['puzzleLink'] = ''
    button.href = `${location.pathname}?puzzle=${encodeURIComponent(item.slug)}`
    const preview = document.createElement('span'); preview.className = 'cross-mini-preview'; preview.setAttribute('aria-hidden', 'true')
    preview.style.setProperty('--preview-columns', String(sample.width))
    preview.style.setProperty('--preview-rows', String(sample.height))
    for (const cell of sample.cells) { const square = document.createElement('i'); square.className = cell.kind === 'block' ? 'cross-dark' : ''; preview.append(square) }
    const text = document.createElement('span'); text.className = 'cross-library-text'
    const title = document.createElement('strong'); title.textContent = sample.title
    const sub = document.createElement('span'); sub.textContent = `${sample.width} × ${sample.height} · ${sample.author}`
    text.append(title, sub); button.append(preview, text); button.insertAdjacentHTML('beforeend', icon('right')); libraryList.append(button)
  }

  let lastPuzzle: Puzzle | null = null
  try {
    const settings: unknown = JSON.parse(localStorage.getItem(`${storageKey}:preferences`) ?? 'null')
    if (isRecord(settings) && typeof settings['skipFilled'] === 'boolean' && typeof settings['advanceWord'] === 'boolean' && typeof settings['showTimer'] === 'boolean') {
      st.preferences = { skipFilled: settings['skipFilled'], advanceWord: settings['advanceWord'], showTimer: settings['showTimer'] }
    }
    const last: unknown = JSON.parse(localStorage.getItem(`${storageKey}:last-puzzle`) ?? 'null')
    if (last !== null) {
      const loaded = parsePuzzle(last)
      if (loaded.ok) lastPuzzle = loaded.value
      else notify(loaded.error)
    }
  } catch { notify('Preferences could not be loaded. Using the defaults.') }
  const initialLocation = standalone ? { puzzle: initialPuzzle, missing: false } : resolvePuzzleLocation(location.search, history.state, lastPuzzle)
  puzzle = initialLocation.puzzle
  st.missingPuzzle = initialLocation.missing
  if (initialLocation.missing) st.panel = 'library'
  else pendingHistory = 'replace'
  progress = restore(puzzle, initial.progress)
  st.selection = selectEntry(puzzle.entries[0]!, progress, true)
  st.mode = isSolved(puzzle, progress) ? 'complete' : 'ready'
  // First paint uses the same projection as every subsequent frame.
  render(performance.now())

  function flush(): void {
    const now = performance.now()
    if (scheduled !== null) cancelAnimationFrame(scheduled)
    render(now)
    save(now)
  }

  return {
    element,
    request: request => destroyed ? Promise.resolve({ error: 'This player has been destroyed.' }) : new Promise(resolve => dispatch({ type: 'agent', request, resolve })),
    destroy() {
      if (destroyed) return
      flush()
      destroyed = true
      lifecycle.abort()
      layoutResize.disconnect()
      if (scheduled !== null) cancelAnimationFrame(scheduled)
      if (clockTimeout !== null) clearTimeout(clockTimeout)
      if (saveTimeout !== null) clearTimeout(saveTimeout)
      for (const download of downloads) { clearTimeout(download.timeout); URL.revokeObjectURL(download.url) }
      if (dom.dialog.open) dom.dialog.close()
      element.remove()
    },
  }



  function downloadPuzzle(selected: Puzzle, kind: 'puz' | 'html' | 'progress', snapshot: Progress | null): void {
    try {
      let bytes: Uint8Array<ArrayBuffer>
      if (kind === 'puz') {
        const result = encodePuz(selected)
        if (!result.ok) { dispatch({ type: 'error', message: result.error }); return }
        bytes = result.value
      } else {
        const result = portableHtml(selected, snapshot, environment.assets(), { brand, homeUrl: configuration.homeUrl, storageKey })
        if (!result.ok) { dispatch({ type: 'error', message: result.error }); return }
        bytes = result.value
      }
      const url = URL.createObjectURL(new Blob([bytes], { type: kind === 'puz' ? 'application/x-crossword' : 'text/html;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url; link.download = `${puzzleFilename(selected)}${kind === 'progress' ? '-in-progress' : ''}.${kind === 'puz' ? 'puz' : 'html'}`
      element.append(link); link.click(); link.remove()
      dispatch({ type: 'downloaded' })
      const download = { url, timeout: setTimeout(() => {
        URL.revokeObjectURL(url)
        downloads.splice(downloads.indexOf(download), 1)
      }, 60_000) }
      downloads.push(download)
    } catch (error) {
      dispatch({ type: 'error', message: error instanceof Error ? error.message : 'The puzzle could not be downloaded.' })
    }
  }

}

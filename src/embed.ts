import { createHtml, type HtmlOptions, type HtmlPuzzle } from './html'
import type { Result } from './model'

export type MountedPlayer = {
  /** Size this frame with your own CSS. It defaults to filling its host. */
  frame: HTMLIFrameElement
  /** Save pending progress, remove the frame, and release its document URL. */
  destroy: () => void
}

/** Mount the included player in its own document. Importing this module touches no DOM. */
export async function mountPlayer(host: HTMLElement, puzzle: HtmlPuzzle, options: HtmlOptions = {}): Promise<Result<MountedPlayer>> {
  const html = await createHtml(puzzle, { ...options, chrome: options.chrome ?? 'puzzle' })
  if (!html.ok) return html
  const url = URL.createObjectURL(new Blob([html.value], { type: 'text/html;charset=utf-8' }))
  const frame = document.createElement('iframe')
  frame.className = 'cross-frame'
  frame.title = 'Crossword player'
  frame.style.cssText = 'display:block;width:100%;height:100%;border:0'
  frame.src = url
  host.append(frame)
  return { ok: true, value: {
    frame,
    destroy() {
      frame.contentWindow?.dispatchEvent(new Event('cross:save'))
      frame.remove()
      URL.revokeObjectURL(url)
    },
  } }
}

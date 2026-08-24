/**
 * The one question the application asks, drawn in its own window rather than by the
 * system.
 *
 * `window.confirm` and the native message box are the same thing in different frames:
 * the wrong typeface, the wrong colours, and a title bar saying the name of the
 * executable. They also stop the world - which sounds safe and is not, because the
 * shell output stops arriving and a tab's light stops moving while the question is on
 * screen, exactly when somebody is deciding whether something is still running.
 *
 * So this is HTML, it answers with a promise, and the application carries on behind
 * it. What it borrows from the native dialog is the discipline: one default answer,
 * Escape means the safe one, nothing outside the box can be clicked, and it is answered
 * from the keyboard alone - the arrows move between the answers and Enter takes the one
 * that is on.
 */
export type ModalRequest = {
  message: string
  /** In reading order. The last one is the safe answer, and the one Escape gives. */
  buttons: string[]
}

/** Answers are indexes into `buttons`, as a message box does it. */
export type ModalAnswer = number

let queue: Promise<unknown> = Promise.resolve()

/**
 * Asks, and resolves with the index of the button chosen. Questions queue rather than
 * stack: two boxes on top of each other would leave nobody sure what they answered.
 */
export function askModal(host: HTMLElement, request: ModalRequest): Promise<ModalAnswer> {
  const answer = queue.then(() => show(host, request))
  // The queue must survive a rejected question, or every later one is refused with it.
  queue = answer.catch(() => undefined)
  return answer
}

function show(host: HTMLElement, request: ModalRequest): Promise<ModalAnswer> {
  return new Promise((resolve) => {
    const safe = Math.max(request.buttons.length - 1, 0)
    host.textContent = ''
    host.hidden = false

    const box = document.createElement('div')
    box.className = 'modal-box'
    box.setAttribute('role', 'alertdialog')
    box.setAttribute('aria-label', request.message)

    const text = document.createElement('p')
    text.className = 'modal-message'
    text.textContent = request.message
    box.append(text)

    const row = document.createElement('div')
    row.className = 'modal-buttons'

    const finish = (index: ModalAnswer): void => {
      host.hidden = true
      host.textContent = ''
      document.removeEventListener('keydown', onKey, true)
      resolve(index)
    }

    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        finish(safe)
        return
      }

      /*
       * The arrows move between the answers, the way they do in a native message box.
       * Tab does too, since the buttons are buttons - this is for the hand that never
       * leaves the arrow keys, and for a question that appears while both hands are on
       * the keyboard, which is every question this application asks.
       */
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
      if (step === 0) return
      event.preventDefault()
      event.stopPropagation()
      const buttons = [...row.querySelectorAll('button')]
      const at = buttons.findIndex((button) => button === document.activeElement)
      const next = at < 0 ? safe : (at + step + buttons.length) % buttons.length
      buttons[next]?.focus()
    }

    request.buttons.forEach((label, index) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'modal-btn' + (index === safe ? ' modal-btn--safe' : '')
      button.textContent = label
      button.addEventListener('click', () => finish(index))
      row.append(button)
    })

    box.append(row)
    host.append(box)

    /*
     * Captured, so Escape answers the question rather than reaching whatever is behind
     * it - the shortcut panel and the palette both close on Escape as well.
     */
    document.addEventListener('keydown', onKey, true)

    // The safe answer takes the keyboard: Enter on a question nobody read is a refusal.
    const buttons = [...row.querySelectorAll('button')]
    buttons[safe]?.focus()
  })
}

/**
 * The other shape of box: one that says something instead of asking. Same frame, same
 * queue, same discipline about Escape - what differs is that the content is a piece of
 * a document rather than a sentence, so it is given as markup and allowed to scroll.
 *
 * It exists because the answer to "where did we leave off" is a handful of points, and
 * a handful of points scrolling past in a terminal is not something anyone reads.
 */
export function showNote(
  host: HTMLElement,
  note: { title: string; html: string; close: string }
): Promise<void> {
  const shown = queue.then(
    () =>
      new Promise<void>((resolve) => {
        host.textContent = ''
        host.hidden = false

        const box = document.createElement('div')
        box.className = 'modal-box modal-box--note'
        box.setAttribute('role', 'dialog')
        box.setAttribute('aria-label', note.title)

        const heading = document.createElement('h2')
        heading.className = 'modal-title'
        heading.textContent = note.title
        box.append(heading)

        const body = document.createElement('div')
        body.className = 'modal-note markdown-body'
        // Rendered by the same sanitising renderer the document pane uses.
        body.innerHTML = note.html
        box.append(body)

        const row = document.createElement('div')
        row.className = 'modal-buttons'

        const finish = (): void => {
          host.hidden = true
          host.textContent = ''
          document.removeEventListener('keydown', onKey, true)
          resolve()
        }

        function onKey(event: KeyboardEvent): void {
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.stopPropagation()
          finish()
        }

        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'modal-btn modal-btn--safe'
        button.textContent = note.close
        button.addEventListener('click', finish)
        row.append(button)

        box.append(row)
        host.append(box)
        document.addEventListener('keydown', onKey, true)
        button.focus()
      })
  )
  queue = shown.catch(() => undefined)
  return shown
}

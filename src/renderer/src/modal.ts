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
 * Escape means the safe one, and nothing outside the box can be clicked.
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
      }
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

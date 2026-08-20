/**
 * What it takes to hand a file to a textarea and get it back unharmed.
 *
 * A textarea speaks in `\n` whatever the file was written in, so writing back what it
 * gives would turn a CRLF file into an LF one. That is a one-character edit showing up
 * in a diff as the whole file, which is the kind of quiet damage that makes a tool
 * untrustworthy for the one job it has here.
 */
export type Eol = '\n' | '\r\n'

/**
 * Whichever ending the file mostly uses. A stray CRLF in an LF file must not convert
 * the rest of it, so this counts rather than looks for the first one.
 *
 * A file with no line ending at all gives no signal, and then `\n` is as good an
 * answer as any: nothing existing is being changed, only what is typed next.
 */
export function detectEol(content: string): Eol {
  let crlf = 0
  let lf = 0
  for (let i = 0; i < content.length; i++) {
    if (content[i] !== '\n') continue
    if (i > 0 && content[i - 1] === '\r') crlf++
    else lf++
  }
  return crlf > lf ? '\r\n' : '\n'
}

/** The text as it should land on disk: the editor's `\n` back in the file's ending. */
/**
 * The text as a textarea will hold it. A textarea normalises endings on its own, so
 * without this the value read back from an untouched CRLF file would differ from the
 * file, and every such file would look edited the moment it was opened.
 */
export function toEditorText(content: string): string {
  return content.replace(/\r\n/g, '\n')
}

export function toFileText(draft: string, eol: Eol): string {
  const normalised = draft.replace(/\r\n/g, '\n')
  return eol === '\r\n' ? normalised.replace(/\n/g, '\r\n') : normalised
}

const MARKDOWN = /\.(md|markdown|mdown|mkd|mdx)$/i

/** Only these are worth rendering; everything else is shown as it is written. */
export function isMarkdown(path: string): boolean {
  return MARKDOWN.test(path)
}

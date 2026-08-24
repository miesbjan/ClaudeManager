/**
 * The question the application asks about a place it is returning to.
 *
 * The application has no model in it and never will - the agent stays an outside
 * process. What it has instead is a well-put question and somewhere better than a
 * scrolling terminal to show the answer: this is the wording, and the arguments the
 * command is given so that answering it can only read.
 */
import type { Lang } from './i18n'

/** How far back to look. One number, tuned by use rather than by argument. */
export const COMMITS = 10

/**
 * Read-only by construction: a summary that changes the thing it summarises is not a
 * summary. Plan mode is what buys that - it may read anything and write nothing.
 *
 * The obvious alternative was a list of allowed tools, and it does not survive the
 * journey: what is on PATH is a `.cmd` shim, which Windows will only run through a
 * shell, and a shell eats the brackets and stars that such a list is made of. One
 * plain word passes through anything.
 */
export const PERMISSION_MODE = 'plan'

/** Enough turns to look and answer, few enough that a wrong turn cannot run away. */
export const MAX_TURNS = 12

const EN = (commits: number): string =>
  [
    `Look at what has happened in this project over its last ${commits} commits.`,
    'Summarise it for somebody coming back to the project after a while, in the language of what it does - not of which files changed.',
    'Answer as two short lists under the headings "Done" and "Next", at most five points each, one line per point.',
    'Name a file only where the point makes no sense without it. Do not describe the code.',
    '"Next" is what visibly follows from the work so far: unfinished threads, obvious next steps, anything left in the middle.',
    'Read only - change nothing.'
  ].join(' ')

const CS = (commits: number): string =>
  [
    `Podívej se, co se v tomhle projektu dělo za posledních ${commits} commitů.`,
    'Shrň to pro člověka, který se k projektu po čase vrací, jazykem toho, co aplikace dělá - ne toho, které soubory se změnily.',
    'Odpověz jako dva krátké seznamy pod nadpisy "Uděláno" a "Dál", nejvýš pět bodů v každém, jeden řádek na bod.',
    'Soubor jmenuj jen tam, kde bez něj bod nedává smysl. Kód nepopisuj.',
    '"Dál" je to, co ze zatímní práce viditelně plyne: nedodělané nitky, zjevné další kroky, co zůstalo rozdělané.',
    'Jen čti, nic neměň.'
  ].join(' ')

/** The question itself, in the language the window is speaking. */
export function summaryPrompt(lang: Lang, commits: number = COMMITS): string {
  return lang === 'cs' ? CS(commits) : EN(commits)
}

/**
 * What the agent printed, tidied for a box that is meant to be read at a glance: the
 * chatter around an answer ("I'll take a look…") is not the answer, and print mode
 * sometimes ends with an offer to carry on, which there is nobody to accept.
 */
export function tidySummary(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const first = lines.findIndex((line) => /^\s*(#{1,6}\s|\*\*|[-*•]\s|\d+[.)]\s)/.test(line))
  const body = first > 0 ? lines.slice(first) : lines
  return body.join('\n').trim()
}

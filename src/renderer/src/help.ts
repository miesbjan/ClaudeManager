/**
 * The shortcut list shown by the `?` button. Kept as data in one place so the panel
 * and the README cannot drift apart unnoticed - if a binding changes, it changes
 * here and the panel follows.
 */
// A type only: it is erased before this file is ever loaded, so the module stays
// free of runtime imports and can be read straight from a test.
import type { Lang } from '../../shared/i18n'

/**
 * What the application is for, in the words somebody who has never seen it needs.
 *
 * It lives at the top of the same panel as the shortcuts, because that is the one
 * place a new user already presses: a screen of its own would have to be dismissed,
 * remembered as dismissed, and would then never be seen again.
 */
export type HelpIntro = { lead: string; points: string[] }

export type HelpRow = { keys: string; action: string }
export type HelpSection = { title: string; rows: HelpRow[] }
/** Something the app does on its own, with no key to press. */
export type HelpNote = { title: string; body: string }

const EN_INTRO: HelpIntro = {
  lead: 'A console for one project at a time: a shell on the left, what you are steering by on the right. Somewhere between a terminal and an editor, and much closer to the terminal.',
  points: [
    'A tab is a place, not a file: a directory, its shell, its dev server and the files you have open there. Ctrl+T makes another one.',
    'Up to three panes in a tab - shell, document, the page of the app you are building. Alt and the arrows move between them, Alt+Z zooms one.',
    'The document reloads itself when anything rewrites the file, and tints the blocks that changed, so you can see what the agent just did.',
    'The dot on a tab says what its agent is doing: working, finished, asking for permission, broken. The taskbar button carries the same while you are looking elsewhere, and flashes when one finishes.',
    'Bottom right is what it costs: this session, and the five-hour and seven-day limits of the account. Editing is small on purpose - Ctrl+S saves a file, an editor this is not.'
  ]
}

const CS_INTRO: HelpIntro = {
  lead: 'Konzole pro jeden projekt: vlevo shell, vpravo to, podle čeho se orientuješ. Něco mezi terminálem a editorem, mnohem blíž terminálu.',
  points: [
    'Tab je místo, ne soubor: adresář, jeho shell, jeho dev server a soubory, které tam máš otevřené. Ctrl+T udělá další.',
    'V tabu jsou až tři panely - shell, dokument, stránka aplikace, kterou staví. Alt a šipky mezi nimi přepínají, Alt+Z jeden zvětší.',
    'Dokument se načte sám, kdykoli soubor někdo přepíše, a podbarví změněné bloky, takže vidíš, co agent právě udělal.',
    'Tečka na tabu říká, co jeho agent dělá: pracuje, dobehl, čeká na povolení, rozbilo se. Ikona v hlavním panelu nese totéž, když se koukáš jinam, a blikne, když něco dobehne.',
    'Vpravo dole je, co to stojí: tahle session a pětihodinový i sedmidenní limit účtu. Editace je záměrně malá - Ctrl+S soubor uloží, editor to není.'
  ]
}

export function helpIntro(lang: Lang): HelpIntro {
  return lang === 'cs' ? CS_INTRO : EN_INTRO
}

const EN: HelpSection[] = [
  {
    title: 'Documents and tabs',
    rows: [
      {
        keys: 'Ctrl+P / Ctrl+O',
        action: 'go to a file: in the project / anywhere'
      },
      { keys: 'Ctrl+P → Delete', action: 'close that file and stop offering it here (or its ×)' },
      { keys: 'Ctrl+T / Ctrl+G', action: 'another place, here / typed out' },
      { keys: 'Ctrl+Shift+U', action: 'what has been happening in this place' },
      { keys: 'Ctrl+W', action: 'close the file; the last one closes the tab' },
      {
        keys: 'Ctrl+PageUp / PageDown',
        action: 'the other files open in this tab'
      },
      { keys: 'Ctrl+Tab / Ctrl+Shift+Tab', action: 'next / previous tab' },
      { keys: 'Ctrl+1 … Ctrl+9', action: 'jump to tab by position' },
      { keys: 'Ctrl+F', action: 'find in the document' },
      { keys: 'Ctrl+R', action: 'reload the document' },
      { keys: 'Ctrl+E / Ctrl+S', action: 'rendered or as written / save' },
      { keys: 'Ctrl+D', action: 'theme: Auto / Light / Dark' },
      { keys: 'Ctrl+`', action: 'show or hide the shell' },
      { keys: 'Ctrl+= / Ctrl+-', action: 'terminal font, from anywhere' }
    ]
  },
  {
    title: 'Panes (Alt, as in tmux)',
    rows: [
      {
        keys: 'Alt+← / → / 1 / 2 / 3…9',
        action: 'go to: by side, or shell / server / the files as opened'
      },
      { keys: 'Alt+Shift+← / →', action: 'move the divider' },
      { keys: 'Alt+Z', action: 'zoom the focused pane, and back' },
      { keys: 'Alt+W', action: 'right side: the other one of document / dev server' },
      {
        keys: 'Alt+P',
        action: 'prompt buffer under the shell; Ctrl+Enter sends it'
      }
    ]
  },
  {
    title: 'While the shell has focus',
    rows: [
      { keys: 'Ctrl+C / Ctrl+V', action: 'copy the selection, or interrupt / paste' },
      {
        keys: 'Ctrl+Shift+W, R, D',
        action: 'the app shortcuts above; Ctrl+O, P, T, G, 1…9 as they are'
      },
      { keys: 'everything else', action: 'goes to the shell untouched' }
    ]
  },
  {
    title: 'Mouse',
    rows: [
      { keys: 'middle-click a tab', action: 'close it' },
      { keys: 'double-click a tab', action: 'name it something of your own' },
      { keys: 'right-click a tab', action: 'rename, reload, close, reveal' },
      { keys: 'drag a tab sideways', action: 'move it along the bar' },
      { keys: 'right-click in the shell', action: 'paste, or copy a selection' },
      { keys: 'drag a file in', action: 'open it in this tab' }
    ]
  }
]

/*
 * The keys are the same in both languages - they are what is printed on the keyboard -
 * so only what they do is translated, row for row.
 */
const CS: HelpSection[] = [
  {
    title: 'Dokumenty a taby',
    rows: [
      {
        keys: 'Ctrl+P / Ctrl+O',
        action: 'skok na soubor: v projektu / kdekoli'
      },
      { keys: 'Ctrl+P → Delete', action: 'zavři ten soubor a přestaň ho tu nabízet (nebo jeho ×)' },
      { keys: 'Ctrl+T / Ctrl+G', action: 'další místo, zde / napsané' },
      { keys: 'Ctrl+Shift+U', action: 'co se v tomhle místě dělo' },
      { keys: 'Ctrl+W', action: 'zavřít soubor; poslední zavře tab' },
      {
        keys: 'Ctrl+PageUp / PageDown',
        action: 'další soubory otevřené v tomhle tabu'
      },
      { keys: 'Ctrl+Tab / Ctrl+Shift+Tab', action: 'další / předchozí tab' },
      { keys: 'Ctrl+1 … Ctrl+9', action: 'skok na tab podle pořadí' },
      { keys: 'Ctrl+F', action: 'hledat v dokumentu' },
      { keys: 'Ctrl+R', action: 'načíst dokument znovu' },
      { keys: 'Ctrl+E / Ctrl+S', action: 'vykreslený nebo zdroj / uložit' },
      { keys: 'Ctrl+D', action: 'motiv: Auto / Světlý / Tmavý' },
      { keys: 'Ctrl+`', action: 'ukázat nebo schovat shell' },
      { keys: 'Ctrl+= / Ctrl+-', action: 'písmo terminálu, odkudkoli' }
    ]
  },
  {
    title: 'Panely (Alt, jako v tmuxu)',
    rows: [
      {
        keys: 'Alt+← / → / 1 / 2 / 3…9',
        action: 'jdi na: podle strany, nebo shell / server / soubory jak šly'
      },
      { keys: 'Alt+Shift+← / →', action: 'posunout dělič' },
      { keys: 'Alt+Z', action: 'zvětšit zaostřený panel a zpět' },
      { keys: 'Alt+W', action: 'pravá strana: ten druhý z dokument / dev server' },
      { keys: 'Alt+P', action: 'prompt pod shellem; Ctrl+Enter ho odešle' }
    ]
  },
  {
    title: 'Když má fokus shell',
    rows: [
      { keys: 'Ctrl+C / Ctrl+V', action: 'kopíruj výběr, nebo přeruš / vlož' },
      {
        keys: 'Ctrl+Shift+W, R, D',
        action: 'zkratky aplikace výše; Ctrl+O, P, T, G, 1…9 i bez shiftu'
      },
      { keys: 'cokoli dalšího', action: 'jde nedotčené do shellu' }
    ]
  },
  {
    title: 'Myš',
    rows: [
      { keys: 'prostřední tlačítko na tabu', action: 'zavře ho' },
      { keys: 'dvojklik na tab', action: 'pojmenuje ho po svém' },
      {
        keys: 'pravé tlačítko na tabu',
        action: 'přejmenovat, načíst, zavřít, ukázat'
      },
      { keys: 'tažení tabu do strany', action: 'přesune ho po liště' },
      { keys: 'pravé tlačítko v shellu', action: 'vloží, nebo zkopíruje výběr' },
      { keys: 'přetažení souboru', action: 'otevře ho v tomhle tabu' }
    ]
  }
]

/*
 * Half of what the window does happens without anyone pressing anything - the dot on
 * a tab, the reload, the address the shell let slip. A panel that lists only keys
 * leaves all of it undiscovered, so it is written down here too.
 */
const EN_NOTES: HelpNote[] = [
  {
    title: 'The dot on a tab',
    body: 'appears only where an agent is running - a shell over a directory gets none. A ring that turns while it works, green once finished or quiet, amber while it is asking for permission, red when it rang the bell or its shell fell over.'
  },
  {
    title: 'A place keeps its files',
    body: 'whatever you open in a directory is offered by Ctrl+P the next time you are there, without anything being typed - most recent first, and nothing has to be starred by hand. It outlives the tab and the session, the way the place does.'
  },
  {
    title: 'The document reloads itself',
    body: 'whoever writes the file - you, an editor, an agent - the view follows, and what changed is marked for a moment.'
  },
  { title: 'Run', body: 'appears once a project is recognised and runs its script in the shell.' },
  {
    title: 'The dev server',
    body: 'an address the shell prints opens in the right pane by itself. Only addresses on this machine are shown; you can also type one in.'
  },
  {
    title: 'Closing a tab that is busy',
    body: 'asks first. The cross is a few pixels from where a tab is dragged, and behind it may be an agent halfway through a job; a tab that has finished still closes at once.'
  },
  {
    title: 'Closing the window',
    body: 'leaves the application running behind the tray icon whenever an agent is in one of the tabs, because the click that tidies the desktop should not kill a job halfway through. A shell nobody recognised as an agent is asked about; with nothing running the window simply closes.'
  },
  {
    title: 'Unsaved edits',
    body: 'refuse to be closed over. A file, a tab or the window asks first, and the status bar says which file is holding it up.'
  },
  {
    title: 'The icon in the taskbar',
    body: 'carries the number of tabs waiting for you - green finished, amber asking for permission, red broken. The number drops as you visit them, one at a time: being in a tab is the acknowledgement, and looking at the window is not, since a glance at one tab says nothing about the other two. Only a run somebody asked for counts, or one long enough to have been a run at all - a screen repainting itself is neither.'
  },
  {
    title: 'Bottom right',
    body: 'this session: what the model had in front of it last turn and what it has written. Below it the five-hour window and the seven-day limit of the account.'
  },
  {
    title: 'When something goes wrong',
    body: 'a shell keeps running even when the window it was shown in dies: the new window takes it back and says so in the status bar. The events behind that - a window rebuilt, a shell started, taken over or ended, a page in the pane that crashed - are written to log.txt in %APPDATA%\\claude-manager. Ctrl+Shift+L adds what each shell has printed, which is the one thing a screenshot cannot show: a program that draws a screen clears up after itself on the way out.'
  }
]

const CS_NOTES: HelpNote[] = [
  {
    title: 'Tečka na tabu',
    body: 'objeví se jen tam, kde běží agent - nad samotným shellem v adresáři nesvítí nic. Kroužek se točí, dokud se pracuje, zelená, když je hotovo nebo je ticho, oranžová, když se ptá na povolení, červená, když zazvonil nebo mu spadl shell.'
  },
  {
    title: 'Místo si pamatuje své soubory',
    body: 'co v adresáři otevřeš, ti Ctrl+P nabídne, až tam budeš příště, bez psaní - od naposledy otevřeného, a nic se nemusí označovat ručně. Přežije to tab i session, stejně jako to místo.'
  },
  {
    title: 'Dokument se načítá sám',
    body: 'ať soubor přepíše kdokoli - ty, editor, agent - pohled jde za ním a změněné místo se na chvíli označí.'
  },
  {
    title: 'Spustit',
    body: 'objeví se, jakmile je rozpoznaný projekt, a pustí jeho skript v shellu.'
  },
  {
    title: 'Dev server',
    body: 'adresu, kterou shell vypíše, otevře pravý panel sám. Zobrazí se jen adresa na tomhle stroji; napsat ji jde i ručně.'
  },
  {
    title: 'Zavření tabu, ve kterém se pracuje',
    body: 'se nejdřív zeptá. Křížek je pár pixelů od místa, kde se tab tahá, a za ním může být agent v půlce práce; hotový tab se zavře rovnou.'
  },
  {
    title: 'Zavření okna',
    body: 'nechá aplikaci běžet za ikonou v traye vždycky, když je v některém tabu agent - klik, kterým si uklízíš plochu, nemá zabít rozdělanou práci. Na běžící shell, který nikdo nerozpoznal jako agenta, se zeptá; když neběží nic, okno se prostě zavře.'
  },
  {
    title: 'Neuložené úpravy',
    body: 'se nedají zavřít mlčky. Soubor, tab i okno se zeptají a stavová lišta řekne, který soubor to drží.'
  },
  {
    title: 'Ikona v hlavním panelu',
    body: 'nese počet tabů, které na tebe čekají - zelená dobehlo, oranžová ptá se na povolení, červená spadlo. Číslo klesá, jak je obcházíš: potvrzením je to, že v tabu jsi, ne že se koukáš na okno - pohled na jeden tab nic neříká o dalších dvou. Počítá se jen běh, o který někdo požádal, nebo dost dlouhý, aby to běh vůbec byl; překreslená obrazovka není ani jedno.'
  },
  {
    title: 'Vpravo dole',
    body: 'tahle session: co měl model minule před sebou a co zatím napsal. Pod tím pětihodinové okno a sedmidenní limit účtu.'
  },
  {
    title: 'Když se něco pokazí',
    body: 'shell běží dál, i když okno, ve kterém byl vidět, spadne: nové okno si ho vezme zpátky a řekne to ve stavovém řádku. Co se dělo - přestavěné okno, spuštěný, převzatý nebo ukončený shell, spadlá stránka v panelu - se píše do log.txt v %APPDATA%\\claude-manager. Ctrl+Shift+L k tomu přidá, co který shell vypsal - tedy to jediné, co ze snímku obrazovky nevyčteš, protože program, který kreslí obrazovku, po sobě při odchodu uklidí.'
  }
]

export function shortcutSections(lang: Lang): HelpSection[] {
  return lang === 'cs' ? CS : EN
}

export function helpNotes(lang: Lang): HelpNote[] {
  return lang === 'cs' ? CS_NOTES : EN_NOTES
}

/** Kept for the test that guards the panel against a binding nobody wrote down. */
export const SHORTCUTS = EN

export type KeyToken = { kind: 'key' | 'text'; text: string }

/**
 * Splits the left-hand column into what should be drawn as a key cap and what should
 * not. Some rows describe a gesture rather than a chord - `drag a file in` - and
 * setting each of those words in a cap makes the panel unreadable, so a row only
 * becomes caps if it actually names a modifier.
 */
export function keyTokens(keys: string): KeyToken[] {
  if (!/Ctrl|Alt|Shift/.test(keys)) return [{ kind: 'text', text: keys }]

  const tokens: KeyToken[] = []
  for (const [index, word] of keys.split(' ').entries()) {
    if (index > 0) tokens.push({ kind: 'text', text: ' ' })
    if (word === '/' || word === '…' || word === '+') {
      tokens.push({ kind: 'text', text: word })
      continue
    }
    // A comma separates the keys, it is not one of them.
    const trailing = word.endsWith(',') ? ',' : ''
    tokens.push({ kind: 'key', text: trailing ? word.slice(0, -1) : word })
    if (trailing) tokens.push({ kind: 'text', text: trailing })
  }
  return tokens
}

/** Builds the panel contents once; the caller only shows and hides it afterwards. */
export function renderShortcuts(
  host: HTMLElement,
  lang: Lang,
  labels: { intro: string; heading: string; notes: string; close: string }
): void {
  host.textContent = ''

  const introTitle = document.createElement('h2')
  introTitle.textContent = labels.intro
  host.append(introTitle)

  const intro = helpIntro(lang)
  const lead = document.createElement('p')
  lead.className = 'help-lead'
  lead.textContent = intro.lead
  host.append(lead)

  const points = document.createElement('ul')
  points.className = 'help-points'
  for (const point of intro.points) {
    const item = document.createElement('li')
    item.textContent = point
    points.append(item)
  }
  host.append(points)

  const heading = document.createElement('h2')
  heading.textContent = labels.heading
  host.append(heading)

  const grid = document.createElement('div')
  grid.className = 'help-grid'

  for (const section of shortcutSections(lang)) {
    // Title and list travel together: as separate grid children they end up in
    // different columns, with a heading beside somebody else's keys.
    const block = document.createElement('section')

    const title = document.createElement('h3')
    title.textContent = section.title
    block.append(title)

    const list = document.createElement('dl')
    for (const row of section.rows) {
      const keys = document.createElement('dt')
      for (const token of keyTokens(row.keys)) {
        if (token.kind === 'text') keys.append(token.text)
        else {
          const kbd = document.createElement('kbd')
          kbd.textContent = token.text
          keys.append(kbd)
        }
      }
      const action = document.createElement('dd')
      action.textContent = row.action
      list.append(keys, action)
    }
    block.append(list)
    grid.append(block)
  }

  host.append(grid)

  const notesTitle = document.createElement('h3')
  notesTitle.className = 'help-notes-title'
  notesTitle.textContent = labels.notes
  host.append(notesTitle)

  const notes = document.createElement('ul')
  notes.className = 'help-notes'
  for (const note of helpNotes(lang)) {
    const item = document.createElement('li')
    const name = document.createElement('strong')
    name.textContent = note.title
    item.append(name, ' ' + note.body)
    notes.append(item)
  }
  host.append(notes)

  const hint = document.createElement('p')
  hint.className = 'help-hint'
  hint.textContent = labels.close
  host.append(hint)
}

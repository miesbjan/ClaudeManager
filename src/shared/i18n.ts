/**
 * Interface text in the two languages this is used in.
 *
 * English is the source: `cs` is typed against its keys, so a translation that is
 * missing or misspelled is a compile error rather than a hole in the window. Values
 * carry `{name}` placeholders where a number or a path belongs.
 */
export type Lang = 'en' | 'cs'

export const LANGS: Lang[] = ['en', 'cs']

const en = {
  'toolbar.newTab': '+ New tab',
  'toolbar.newTab.title': 'New tab (Ctrl+T)',
  'toolbar.open': 'Open file',
  'toolbar.open.title': 'Open a file (Ctrl+O)',
  'toolbar.folder': 'Open folder',
  'toolbar.folder.title': 'Open a folder as a place to work in',
  'toolbar.shell': 'Shell',
  'toolbar.shell.title': 'Shell pane (Ctrl+`)',
  'toolbar.web': 'Web',
  'toolbar.web.title': 'Document, dev server, or both (Alt+W)',
  'toolbar.theme.title': 'Switch theme (Ctrl+D)',
  'toolbar.theme.system': 'Theme: Auto',
  'toolbar.theme.light': 'Theme: Light',
  'toolbar.theme.dark': 'Theme: Dark',
  'toolbar.lang.title': 'Interface language',
  'toolbar.help.title': 'Keyboard shortcuts',

  'empty.title': 'No document open.',
  'empty.body': 'Open a folder to work in, or a file to read - by button, or by dropping either into this window.',
  'empty.intro': 'New here? The ? button in the toolbar says what this is for, in a few lines.',

  'status.noFile': 'No file open',
  'status.unavailable': 'unavailable',
  'status.openHere': '{index}/{count} open here - Ctrl+PageUp/PageDown',
  'status.raw': 'as written',
  'status.truncated': 'first 2 MB only, read-only',
  'status.unsaved': 'unsaved - Ctrl+S',
  'status.stale': 'changed on disk while you were editing',
  'status.updated': 'updated {time}',
  'status.watching': 'watching',

  'doc.unavailable.title': 'File unavailable',
  'doc.unavailable.hint':
    'Still watching - the document loads automatically if the file reappears.',
  'doc.gone': 'The file no longer exists on disk.',

  'tray.show': 'Show Project Console',
  'tray.quit': 'Quit',
  'tray.quitAsk': 'Quit Project Console? Anything running in it will stop.',
  'tray.quitConfirm': 'Quit',
  'tray.cancel': 'Cancel',
  'tray.hidden': 'Project Console is still running',
  'tray.hiddenBody': 'Sessions carry on. Click the tray icon to come back.',
  'tray.waiting': '{count} waiting',
  /*
   * Asked when a shell is running that was not recognised as an agent. Recognising one
   * is done by the strings its interface prints, so this is the answer to that being
   * wrong: a question rather than a session ended without a word.
   */
  'close.ask': 'Something is running in a shell. Close the window, or keep it running?',
  'close.quit': 'Close and stop it',
  'close.keep': 'Keep it running',
  'tabbar.new': 'New tab (Ctrl+T)',
  'tab.empty': 'New tab',
  'tab.rename': 'Rename tab',
  'tab.closeFile': 'Close file',
  'tab.close': 'Close tab',
  'tab.closeOthers': 'Close other tabs',
  'tab.copyPath': 'Copy path',
  'tab.reveal': 'Reveal in Explorer',
  'tab.reload': 'Reload',
  'tab.close.title': 'Close tab (Ctrl+W)',

  'activity.working': 'Output is flowing',
  'activity.busy': 'Working - the program said so',
  'activity.done': 'Finished - the program said so',
  'activity.waiting': 'Quiet for a while - probably finished',
  'activity.permission': 'Asking for permission',
  'activity.alert': 'Wants attention',

  'usage.context': 'context {tokens}',
  'usage.out': 'out {tokens}',
  'usage.title':
    '{model} · context is what the model had in front of it last turn\nout is everything it has written this session · read from the session transcript',

  'limits.window': 'Five-hour window',
  'limits.week': 'Seven-day limit',
  'limits.used': '{percent}% used',
  'limits.resetsIn': ', resets in {time}',
  'limits.note': 'A spent window means requests are refused, not billed on top.',
  'limits.readAt': ' · read at {time}',

  'run.title': '{command}\nin {root}',
  'run.choose': 'choose what to run',
  'run.ways': '{count} ways to run',

  'web.onlyLocal': 'Only addresses on this machine can be shown here.',
  'web.gone': 'The page in the pane stopped. Press ↻ to load it again.',
  'window.rebuilt': 'The window stopped and was rebuilt. The shells kept running.',
  'web.reload': 'Reload',
  'web.placeholder': 'localhost:3000',

  'find.placeholder': 'Find in document',
  'find.previous': 'Previous (Shift+Enter)',
  'find.next': 'Next (Enter)',
  'find.close': 'Close (Esc)',
  'find.line': 'line {line}: {text}',

  'prompt.hint': 'Ctrl+Enter sends · Esc back to the shell',
  'prompt.send': 'Send ⏎',
  'prompt.empty': 'Nothing to send - the prompt buffer is empty',

  'place.title': 'Where to go',
  'place.placeholder': '~/source/project',
  'place.here': 'this tab',
  'place.frecent': 'often visited',
  'place.missing': 'no such directory',
  'place.hint': 'Tab goes in · Shift+Tab goes up · Enter goes there',
  'palette.nothingHere': 'Nothing open here',
  'palette.noMatch': 'No match',
  'palette.openHere': 'open here',
  'palette.openIn': 'also open in {tab}',

  'save.notRendered': 'Nothing to render here - this file is shown as it is written',
  'save.unsavedFirst': 'Unsaved edits here - save with Ctrl+S first, or undo them',
  'save.truncated': 'Only the first 2 MB of this file was read, so it cannot be saved',
  'save.stale': 'Changed on disk since you opened it - Ctrl+S again to overwrite',
  'save.failed': 'Could not save: {error}',

  'shell.failed': 'Shell: {error}',
  'terminal.fontSize': 'Terminal font size {size}',

  /* The buttons of the app's own question box. The last one is always the safe answer. */
  'close.discard': 'Close and lose them',
  'close.stop': 'Close and stop it',
  'close.cancel': 'Keep it open',
  'close.window': 'Something is running in a shell. Closing the window stops it.',
  'close.unsaved': 'Unsaved changes in {names}. Close and lose them?',
  'close.busy': 'Something is still running in {name}. Closing the tab stops it. Close anyway?',
  'close.busyMany': 'Something is still running in {count} of these tabs. Closing them stops it. Close anyway?',

  'help.intro': 'What this is',
  'help.heading': 'Keyboard shortcuts',
  'help.notes': 'Without a key',
  'help.close': 'Esc or the ? button closes this.'
} as const

export type StringKey = keyof typeof en

const cs: Record<StringKey, string> = {
  'toolbar.newTab': '+ Nový tab',
  'toolbar.newTab.title': 'Nový tab (Ctrl+T)',
  'toolbar.open': 'Otevřít soubor',
  'toolbar.open.title': 'Otevřít soubor (Ctrl+O)',
  'toolbar.folder': 'Otevřít adresář',
  'toolbar.folder.title': 'Otevřít adresář jako místo, ve kterém pracuješ',
  'toolbar.shell': 'Shell',
  'toolbar.shell.title': 'Panel se shellem (Ctrl+`)',
  'toolbar.web': 'Web',
  'toolbar.web.title': 'Dokument, dev server, nebo obojí (Alt+W)',
  'toolbar.theme.title': 'Přepnout motiv (Ctrl+D)',
  'toolbar.theme.system': 'Motiv: Auto',
  'toolbar.theme.light': 'Motiv: Světlý',
  'toolbar.theme.dark': 'Motiv: Tmavý',
  'toolbar.lang.title': 'Jazyk rozhraní',
  'toolbar.help.title': 'Klávesové zkratky',

  'empty.title': 'Nic není otevřené.',
  'empty.body': 'Otevři adresář, ve kterém chceš pracovat, nebo soubor ke čtení - tlačítkem, nebo přetažením do okna.',
  'empty.intro': 'Jsi tu poprvé? Tlačítko ? v liště na pár řádcích řekne, k čemu to je.',

  'status.noFile': 'Nic není otevřené',
  'status.unavailable': 'nedostupné',
  'status.openHere': '{index}/{count} otevřeno zde - Ctrl+PageUp/PageDown',
  'status.raw': 'jak je zapsaný',
  'status.truncated': 'jen první 2 MB, jen ke čtení',
  'status.unsaved': 'neuloženo - Ctrl+S',
  'status.stale': 'na disku se změnil, zatímco jsi psal',
  'status.updated': 'načteno {time}',
  'status.watching': 'sleduje se',

  'doc.unavailable.title': 'Soubor není dostupný',
  'doc.unavailable.hint': 'Sleduje se dál - jakmile se soubor objeví, načte se sám.',
  'doc.gone': 'Soubor už na disku není.',

  'tray.show': 'Zobrazit Project Console',
  'tray.quit': 'Ukončit',
  'tray.quitAsk': 'Ukončit Project Console? Co v něm běží, se zastaví.',
  'tray.quitConfirm': 'Ukončit',
  'tray.cancel': 'Zrušit',
  'tray.hidden': 'Project Console běží dál',
  'tray.hiddenBody': 'Session pokračují. Kliknutím na ikonu v traye se vrátíš.',
  'tray.waiting': 'čeká {count}',
  'close.ask': 'V shellu něco běží. Zavřít okno, nebo to nechat běžet?',
  'close.quit': 'Zavřít a zastavit',
  'close.keep': 'Nechat běžet',
  'tabbar.new': 'Nový tab (Ctrl+T)',
  'tab.empty': 'Nový tab',
  'tab.rename': 'Přejmenovat tab',
  'tab.closeFile': 'Zavřít soubor',
  'tab.close': 'Zavřít tab',
  'tab.closeOthers': 'Zavřít ostatní taby',
  'tab.copyPath': 'Kopírovat cestu',
  'tab.reveal': 'Ukázat v Průzkumníku',
  'tab.reload': 'Načíst znovu',
  'tab.close.title': 'Zavřít tab (Ctrl+W)',

  'activity.working': 'Teče výstup',
  'activity.busy': 'Pracuje - hlásí to sám program',
  'activity.done': 'Hotovo - hlásí to sám program',
  'activity.waiting': 'Chvíli ticho - nejspíš hotovo',
  'activity.permission': 'Ptá se na povolení',
  'activity.alert': 'Chce pozornost',

  'usage.context': 'kontext {tokens}',
  'usage.out': 'napsáno {tokens}',
  'usage.title':
    '{model} · kontext je to, co měl model minule před sebou\nnapsáno je vše, co za tuhle session vytvořil · čteno z transcriptu session',

  'limits.window': 'Pětihodinové okno',
  'limits.week': 'Sedmidenní limit',
  'limits.used': 'využito {percent} %',
  'limits.resetsIn': ', obnova za {time}',
  'limits.note': 'Vyčerpané okno znamená odmítnutí, ne doúčtování.',
  'limits.readAt': ' · odečteno v {time}',

  'run.title': '{command}\nv {root}',
  'run.choose': 'vyber, co spustit',
  'run.ways': '{count} způsobů spuštění',

  'web.onlyLocal': 'Zobrazit lze jen adresu na tomto stroji.',
  'web.gone': 'Stránka v panelu skončila. Znovu ji načteš tlačítkem ↻.',
  'window.rebuilt': 'Okno spadlo a postavilo se znovu. Shelly běží dál.',
  'web.reload': 'Načíst znovu',
  'web.placeholder': 'localhost:3000',

  'find.placeholder': 'Najít v dokumentu',
  'find.previous': 'Předchozí (Shift+Enter)',
  'find.next': 'Další (Enter)',
  'find.close': 'Zavřít (Esc)',
  'find.line': 'řádek {line}: {text}',

  'prompt.hint': 'Ctrl+Enter odešle · Esc zpět do shellu',
  'prompt.send': 'Odeslat ⏎',
  'prompt.empty': 'Není co poslat - prompt je prázdný',

  'place.title': 'Kam jít',
  'place.placeholder': '~/source/projekt',
  'place.here': 'tento tab',
  'place.frecent': 'často navštěvované',
  'place.missing': 'takový adresář není',
  'place.hint': 'Tab dovnitř · Shift+Tab výš · Enter tam přejde',
  'palette.nothingHere': 'Tady nic otevřeného není',
  'palette.noMatch': 'Nic nenalezeno',
  'palette.openHere': 'otevřít zde',
  'palette.openIn': 'otevřený i v {tab}',

  'save.notRendered': 'Není co vykreslit - soubor se zobrazuje tak, jak je zapsaný',
  'save.unsavedFirst': 'Jsou tu neuložené úpravy - ulož je Ctrl+S, nebo je vrať zpět',
  'save.truncated': 'Načtené byly jen první 2 MB souboru, uložit ho proto nejde',
  'save.stale': 'Na disku se od otevření změnil - Ctrl+S znovu ho přepíše',
  'save.failed': 'Uložení se nezdařilo: {error}',

  'shell.failed': 'Shell: {error}',
  'terminal.fontSize': 'Velikost písma terminálu {size}',

  'close.discard': 'Zavřít a přijít o ně',
  'close.stop': 'Zavřít a zastavit',
  'close.cancel': 'Nechat otevřené',
  'close.window': 'V shellu něco běží. Zavřením okna se to zastaví.',
  'close.unsaved': 'Neuložené změny v {names}. Zavřít a přijít o ně?',
  'close.busy': 'V {name} něco běží. Zavřením tabu se to zastaví. Přesto zavřít?',
  'close.busyMany': 'V {count} z těchto tabů něco běží. Zavřením se to zastaví. Přesto zavřít?',

  'help.intro': 'K čemu to je',
  'help.heading': 'Klávesové zkratky',
  'help.notes': 'Bez zkratky',
  'help.close': 'Zavře se Escapem nebo tlačítkem ?.'
}

const DICTS: Record<Lang, Record<StringKey, string>> = { en, cs }

export function translate(
  lang: Lang,
  key: StringKey,
  vars?: Record<string, string | number>
): string {
  const text = DICTS[lang][key]
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole
  )
}

/** What the button offers next; with two languages it is simply the other one. */
export function nextLang(lang: Lang): Lang {
  return lang === 'en' ? 'cs' : 'en'
}

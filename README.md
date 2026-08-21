# Project Console

A small console for one project at a time, on Windows. A tab holds a shell, the live
document you are steering by, and the app you are building - side by side in one
window.

The document re-renders itself whenever anything on disk rewrites it, and highlights
what changed, so an agent working in the shell beside it can be followed without
rereading the file. One button starts the project; when its dev server announces an
address, the page appears in the pane next to the document.

It is not an editor: no editing, no file tree, no workspace management. Where this is
heading, and what it will deliberately never do, is written down in
[ROADMAP.md](ROADMAP.md).

## Run

```bash
npm install
npm run dev
```

## Build a Windows package

```bash
npm run build        # NSIS installer + portable exe in ./release
npm run build:dir    # unpacked app only (faster, for smoke tests)
```

Every build also hands the result to the desktop: `npm run build` finishes by placing
a shortcut there, pointing at the freshly built app in `release/win-unpacked`. It
starts instantly and always refers to the newest build. For a binary to carry
elsewhere, `npm run desktop -- --exe` copies the portable executable instead - a
shortcut is the default because a desktop redirected into OneDrive would otherwise
upload 80 MB after every build.

`npm run build:exe` is the same build ending with the portable binary on the desktop
instead of a shortcut, and `npm run desktop:sync` runs it only when something has
actually changed: it compares the newest source file against the exe already on the
desktop and does nothing when that one is current. A packaging run takes over a
minute, so that check is what makes it reasonable to call after every change - which
is what the `Stop` hook in `.claude/settings.local.json` does. That file is personal
and git-ignored; the other machine needs its own copy to do the same.

Other scripts: `npm run compile` (bundle without packaging), `npm start`
(run the bundled app), `npm run typecheck`, `npm test`, `npm run desktop`.

`node-pty` is the only native dependency. It ships N-API prebuilt binaries, so there
is no compiler, no `node-gyp` and no rebuild after an Electron upgrade — but its
`.node` files must stay outside the asar archive, which `electron-builder.yml`
handles.

## Tests

```bash
npm test
```

Node's own test runner over the `.ts` files directly, so there is no test framework
and no build step in the way. It covers the two pieces that are pure functions of
their input: the line diff and the Markdown renderer, including the escaping rules the
security model depends on. The tab wiring is not covered - it is DOM code, and a DOM
harness would be the first real test dependency.

Test files import with an explicit `.ts` extension because Node resolves modules that
way; the app's own imports stay extensionless, since a bundler resolves those.

Close the app before rebuilding: it runs straight out of `release/win-unpacked`, and
Windows holds those files while it is open, which fails the packaging step with
"Access is denied".

### If packaging fails with "Cannot create symbolic link"

electron-builder unpacks its `winCodeSign` helper archive, which contains macOS
symlinks; creating symlinks on Windows needs elevation or Developer Mode, so the
step fails on a default account. Either turn on *Settings → System → For
developers → Developer Mode*, or pre-extract the archive once, skipping the two
mac symlinks:

```bash
CACHE="$LOCALAPPDATA/electron-builder/Cache/winCodeSign"
node_modules/7zip-bin/win/x64/7za.exe x "$CACHE/<downloaded>.7z" \
  -o"$CACHE/winCodeSign-2.6.0" -y -xr'!'libcrypto.dylib -xr'!'libssl.dylib
```

This is a machine-wide electron-builder issue, not specific to this project.

## Controls

The `?` button in the toolbar shows the same list inside the app, followed by a short
note on everything that happens without a key being pressed - the dot on a tab, the
reload, Run, the dev server, the readouts in the status bar. `Esc` or a click anywhere
else closes it. It speaks whichever interface language is selected.

| Input                     | Action                                    |
| ------------------------- | ----------------------------------------- |
| `Ctrl+O`                  | open Markdown file(s)                     |
| `Ctrl+P`                  | go to a file: open here, or in the project |
| `Ctrl+W`                  | close the current tab                     |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | next / previous tab                   |
| `Ctrl+1` … `Ctrl+9`       | jump to tab by position                   |
| `Ctrl+F`                  | find in the document or the plain text    |
| `Ctrl+R`                  | force reload of the current file          |
| `Ctrl+D`                  | switch theme: Auto → Light → Dark         |
| ``Ctrl+` ``               | show or hide the shell pane               |
| `Alt+P`                   | prompt buffer under the shell             |
| `Ctrl+Enter`              | send the buffer to the shell              |
| `Ctrl+=` / `Ctrl+-`       | terminal font bigger / smaller            |
| `Ctrl+Shift+C` / `Ctrl+Shift+V` | copy / paste inside the shell       |
| `F12`                     | toggle DevTools                           |
| click a path in the shell | open the file it points at, at that line   |
| middle-click a tab        | close it                                  |
| right-click a tab         | reload, close, close others, copy path, reveal in Explorer |
| drag & drop               | drop `.md` files into the window to open them |

Panes follow what a multiplexer user already knows — **Ctrl acts on tabs, Alt acts on
panes**, with tmux's arrows and `z`:

| Input                     | Action                                    |
| ------------------------- | ----------------------------------------- |
| `Alt+←` / `Alt+→`         | move focus to the pane in that direction  |
| `Alt+1` / `Alt+2` / `Alt+3` | focus the shell / document / dev server |
| `Alt+Shift+←` / `Alt+Shift+→` | move the divider by 5 %               |
| `Alt+Z`                   | zoom the focused pane to the whole tab, and back |
| `Alt+W`                   | right side: document, dev server, both     |

These are the only keys taken from the shell, the way tmux takes a prefix; Alt with
arrows, digits or `z` is unused by PowerShell and the TUIs that run in it.

While the shell has focus its keys belong to it — `Ctrl+W` deletes a word, `Ctrl+D`
means end of input. The app shortcuts above then answer only to their `Ctrl+Shift`
variants; ``Ctrl+` `` and `Ctrl+Tab` keep working from either side.

Files passed on the command line are opened too, so the app works as a handler for
`.md` files (the installer registers the association).

## Behaviour notes

- **Live reload.** Each open file is watched with `chokidar`
  (`awaitWriteFinish` + `atomic`, so partial writes and write-temp-then-rename
  saves are handled). An mtime/size poll every 1.5 s is a fallback for events the
  OS watcher drops, e.g. on network shares. Scroll position survives a reload.
- **Change highlight.** After a reload the blocks that were rewritten hold a tint
  and a left bar for five seconds, so it is visible at a glance what the other writer
  touched. The diff is computed on the source lines and mapped back to the blocks
  they belong to, so a paragraph, list item, table row or code fence lights up as a
  whole. A deletion marks the block that closed over the gap. The flash is shown
  once: a tab that changed in the background flashes when it is next opened, and
  switching away and back does not replay it.
- **Run.** When a document belongs to a project, the shell pane offers one button:
  start it. The project is found by walking up from the document, the way npm and git
  do, since a roadmap under `Project/.claude/docs/` belongs to `Project` - and the
  shell then starts in the project root rather than the folder the document sits in.
  A `package.json` contributes its `dev`, `start`, `serve` or `preview` script; a
  solution or `.csproj` contributes `dotnet run` on whichever project is the
  executable. A monorepo has one `dev:app` per app instead of a plain `dev`, so the
  button offers the list and remembers the choice for that document. There is
  deliberately no build or test button: running builds first anyway, and everything
  else is a command you type into the shell that is already there.
- **Web pane.** When a dev server prints its address, the app picks it up from the
  shell output - Vite's `Local: http://localhost:5173/` and the rest - and shows that
  page beside the document. A run started from the Run button opens it by itself,
  since starting something means wanting to look at it; `Alt+W` then cycles the right
  side through document, dev server, and both at once - three columns with a divider
  between each pair, each remembered per document.

  A page shown here is a frame of its own, handled by its own process: once you click
  inside it, it keeps every key you press, and no shortcut of this app reaches it.
  Keyboard navigation therefore stops at the edge of the frame - `Alt+3` focuses the
  pane, not the page - and `Alt+W` is additionally held as a system accelerator while
  the window has focus, so there is always one key back out.

  Nothing to configure, and nothing has to have announced itself: `Alt+W` opens the pane
  even with no address, with the cursor in its bar, which is the way to show a server
  started by hand somewhere else. An address typed there is a correction and later output
  cannot undo it, until the Run button hands control back.

  Shells are started with `BROWSER=none`, the convention Vite and Create React App
  follow to mean "do not launch a browser": a project configured with
  `server.open: true` would otherwise throw its page into the system browser, which
  is the one place this pane exists to avoid. Run `$env:BROWSER = ''` in the shell to
  get that behaviour back.
  Only addresses on this machine are accepted: a pane that could load any URL would
  be a different application. The frame is sandboxed and the CSP allows framing
  `localhost` alone.
- **Shell pane.** ``Ctrl+` `` splits the tab: a shell on the left, the document on
  the right, with a divider that moves by mouse or by keyboard. Either pane can be
  zoomed to the whole tab and back. The shell starts in the document's own
  directory, so builds and agents run where the file lives. One shell per tab, kept
  alive while the tab is open — hiding the pane or switching tabs does not disturb a
  process running inside it; closing the tab kills it. Whether the pane is open and
  how wide it is are remembered per document.
- **Prompt buffer.** `Alt+P` opens a drawer under the shell to compose a longer
  instruction in, and `Ctrl+Enter` sends it. Writing a multi-line prompt straight into a
  TUI is a fight, because the first newline submits it; the buffer hands the text over as
  a bracketed paste, where newlines are text, and adds the submitting newline afterwards.
  What the shell then does with several lines is the shell's business - PowerShell runs
  them one after another, an agent keeps them as one instruction.

  The drawer belongs to the shell, so opening it in a tab without one starts the shell:
  there would be nowhere to send anything otherwise. A half-written prompt is remembered
  with the place and survives a restart, the way a draft of a file does, and is cleared
  when it is sent - it is in the shell's own history by then, and a buffer that kept it
  would send it twice as easily as once.
- **Find.** `Ctrl+F` searches whichever pane is showing the file - only the document,
  never the shell next to it. In a rendered document matches are painted with the CSS
  custom highlight API rather than by wrapping text in elements, so the markup
  markdown-it produced stays untouched and clearing the search leaves nothing behind.
  `Enter` and `Shift+Enter` step through the matches, wrapping around; `Esc` closes and
  returns focus to the document. A live reload keeps the search: the matches are
  recomputed and the position is kept.

  The plain-text pane is searched too, and it cannot be painted: the highlight API works
  on text nodes and the text inside a textarea is not one. Chromium also paints no
  selection in a field without focus, and focus has to stay in the search box or `Enter`
  would type into the file instead of stepping. So the match is reported in words - the
  status bar says which line and what it says - and `Esc` puts the caret on it, where
  the selection becomes visible and editing carries on from there.
- **Subscription usage.** The far right of the status bar carries a small gauge for
  the five-hour window and one for the seven-day limit - the same numbers `/usage`
  shows in Claude Code - each filling as the window is spent and read like a fuel
  gauge: green below half, amber from half, red from four fifths. They sit next to what the session has used, with
  a rule between: the same question from two sides, session and account, read in one
  glance. The tooltips give the reset times.

  These come from an **undocumented endpoint**, `api/oauth/usage`, called with the
  OAuth token the CLI logged in with. Nothing Claude Code writes to disk carries them:
  transcripts hold per-session tokens and say nothing about the plan, so the only
  other way would be typing `/usage` into the session and reading what comes back,
  which would put a command in someone's conversation. Being undocumented, it can
  change or disappear; every failure - no token, no network, a different shape - ends
  as nothing shown rather than an error. The token is read in the main process, used
  for that one request, and never logged or passed to the renderer, which only ever
  receives two percentages.

- **Session usage.** With a shell open, the right of the status bar reports what the
  Claude session in that project has used: the context it carried on its last turn and
  everything it has written this session. The numbers come from the transcript Claude
  Code keeps anyway, so watching them costs the session nothing and asks it nothing.
  The newest transcript in the project's folder is taken to be the running session,
  which is right unless two sessions share a directory. A read that finds nothing new
  leaves the last number on screen rather than blanking it, and a transcript nobody
  has written to for a quarter of an hour is treated as a session that has ended.
- **Activity dot.** A tab you are not looking at shows a dot: muted while output is
  flowing, green once it has finished, amber while the agent is asking for permission
  and can go no further, red when it rang the bell, failed or its shell fell over.
  A shell closed on purpose - `exit`, code 0 - leaves no dot at all; a red one there
  would be crying wolf. Where a program reports its own state - Claude Code and anything else that
  emits the `OSC 9;4` progress sequence, the one that drives the spinner in a Windows
  Terminal tab - the dot follows that report and is exact. Everything else falls back
  to a guess: quiet for two seconds counts as finished. The two are kept apart
  internally so the guess never overrules the report, and the tooltip says which one
  you are looking at. A document rewritten in the background lights the same dot.
  It clears when the tab is on screen - a tab whose shell pane is hidden keeps
  collecting, because nothing that happened in it was visible.

  The permission state is matched on the labels of Claude Code's approval dialog
  ("Yes, allow all" and the like) rather than on its question, which is a phrase that
  turns up in ordinary prose. It is a fragile signal by nature - a change of wording
  breaks it silently - so it only ever adds to the states read from the stream itself.
- **Deleted files** stay open and marked *unavailable*; they reload by themselves
  if the file reappears.
- **Duplicate names.** Tabs show the file name, extended with as many parent
  directories as needed to stay unambiguous.
- **Where you were.** Each file remembers its scroll position, and remembers it twice:
  once for the rendered document and once for the plain-text pane. They measure different
  things - a place in a layout and a place in the text - so keeping one number would land
  you somewhere random after switching how the file is shown.
- **Files in a tab.** A tab is a place - a directory, its shell, its dev server - and
  it holds however many files you open while working there, one of them on screen.
  Opening a file puts it in the tab you are in; `Ctrl+T` makes another place. `Ctrl+W`
  closes the file and only the last one closes the tab. `Ctrl+PageUp` and
  `Ctrl+PageDown` move between them, the status bar says which of how many, and the
  tab's tooltip lists them all - there is deliberately no second row of chrome for it.
  Switching the file moves neither the shell nor the project: those belong to the place.
- **Paths in the output are clickable.** When the shell prints `src/main/index.ts:224`,
  clicking it opens the file in this tab and lands on that line - in the plain-text pane
  on the line itself, in a rendered document on the block it belongs to. Only paths that
  exist are offered: shape cannot tell `Node.js` from `app.js`, so the disk is asked
  before anything is underlined, and relative paths are resolved against the directory
  the shell was started in. A URL is left alone; addresses belong in the web pane.
- **Go to file.** `Ctrl+P` offers what is open in this tab, and once you type
  anything, every file in the project. An empty query is therefore also the answer to
  "what do I have open here", which is why the tab bar has no second row listing them.
  A file open in another tab still shows up - it is a file of the project - but its row
  says so and `Enter` goes there instead of opening a second copy of it. Matching is a
  substring of the file name, or of the path once the query contains a `/`, which is how
  five files called `index.ts` are told apart. Deliberately not fuzzy: scoring guesses
  and then needs tuning, and this is not that feature. While the shell has focus the key
  is `Ctrl+Shift+P`, because plain `Ctrl+P` there belongs to the shell.
- **Naming a tab.** Double-click its label, or right-click it, and give the place a
  name of its own - what you are doing there usually describes it better than whichever
  file is on screen. A named tab is shown in italics, an empty name goes back to being
  named after the file, and the name is remembered with the rest of the place.
- **Unsaved edits cannot be lost quietly.** Closing a file, a tab or the window asks
  first. The window is refused rather than asked, because a dialog raised while the
  window is already closing proved unreliable; the status bar says what to do.
- **Terminal font.** `Ctrl+=` and `Ctrl+-` change the size, between 8 and 28, and
  the choice is remembered the way the theme is. Those two keys are claimed even while
  the shell has focus, because that is where you are when you want them. Changing the
  size re-measures the pane and tells the shell its new width, so wrapping stays right.
  The family is set once and then forgotten, so it comes from a file rather than a
  dialog: put `{ "terminalFontFamily": "JetBrains Mono, monospace" }` in
  `%APPDATA%/project-console/settings.json`. That file is only ever read, never
  written - `state.json` beside it is the opposite, and the two are separate for that
  reason.
- **Theme.** The toolbar button (or `Ctrl+D`) cycles Auto → Light → Dark. *Auto*
  follows the Windows setting; the other two force the palette. The choice is
  applied through `nativeTheme.themeSource`, so it also covers native chrome such
  as scrollbars and dialogs, and it is remembered between launches.
- **The icon, and the number on it.** The icon is a drawing in `src/shared/icon.ts`,
  not a binary blob: `npm run icon` renders it into `build/icon.ico` with Electron's
  own Chromium, so there is no image library to install and the committed `.ico` can
  always be regenerated from something a diff can show.

  While the window is away, the same drawing carries a badge in its top-right corner
  with the number of tabs waiting for you - finished, asking for permission, or
  broken. A tab counts once however many reasons it has, because the number answers
  "how many places do I have to go"; tabs still working are left out, since they want
  time rather than you. The colour is the most urgent reason among them: green
  finished, amber asking, red broken.

  Windows has `setOverlayIcon` for badges, but it draws in the bottom-right corner and
  nowhere else, which on this icon lands on the lines of the document. So the renderer
  draws the whole icon on a canvas instead and the main process hangs it on the window
  with `setIcon`. Two things to know about that: Windows caches the icon of an
  executable per path, so a build that replaces an older one at the same path can keep
  showing the old icon until the cache turns over, and while running from source all
  Electron apps share one taskbar button, which makes the badge unreliable in `npm run
  dev` and correct in a packaged app.
- **Interface language.** The `EN`/`CS` button beside the theme switches the whole
  interface between English and Czech, and the button shows the language it will
  switch to. English is the source: the Czech table is typed against its keys, so a
  string added in one language and forgotten in the other does not compile. Key names
  are not translated - they are what is printed on the keyboard - and neither are file
  paths or anything the shell prints. The choice is remembered like the theme.
- **Session.** The list of open files and the active tab are stored in
  `%APPDATA%/project-console/state.json`, together with the window geometry, and restored
  on the next launch. Files that no longer exist are shown as unavailable.
- **Relative links.** Clicking a relative link to another `.md` file opens it in a
  new tab; `http(s)` links open in the default browser.
- **Images** referenced relatively or by absolute path are served through a
  dedicated `mdasset://` protocol, so they work in dev and in the packaged app.

## Security model

Markdown is untrusted display content, so:

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- `markdown-it` runs with `html: false` — raw HTML in the source is escaped, not
  parsed, so an injected `<script>` is shown as text
- `markdown-it`'s default link validation rejects `javascript:` and similar URLs
- a strict CSP in `index.html` (`default-src 'none'`, `script-src 'self'`) blocks
  inline scripts and remote code
- the renderer reaches the filesystem only through a fixed set of preload methods
  (`src/preload/index.ts`); there is no generic "run this in main" channel
- navigation and `window.open` from document content are denied; external URLs are
  handed to the system browser
- the shell pane does not widen that surface by much on purpose: the renderer cannot
  name an executable, it can only ask for *a shell in a directory* and the main
  process decides what to run. Nothing in the rendered Markdown — a link, an image,
  a click — has a path to that channel.
- a command built from a project file is only ever `npm run <script>` or
  `dotnet run`, never the body of that script, and the path inside it is quoted for
  PowerShell with single quotes: in double quotes a directory named `$(something)`
  would be run rather than opened
- the web pane frames this machine and nothing else. The address is checked against a
  fixed list of local hostnames, and `frame-src` in the CSP repeats that list for the
  browser to enforce; `test/web.test.ts` fails if the two ever drift apart
- the framed page keeps `allow-scripts allow-same-origin`, which Chromium warns about.
  A dev server needs its own origin to have storage and same-origin requests at all,
  and being cross-origin to this page it cannot reach into it. The exception is
  `npm run dev`: pointing the pane at the app's own dev server on port 5173 makes it
  same-origin and hands the framed page the preload API
- the clipboard is read on one occasion only, when you paste into the shell

## Layout

```text
src/
  main/
    index.ts         Electron main: window, IPC, protocol, security policy
    fileWatcher.ts   chokidar watchers + poll fallback for arbitrary file paths
    terminal.ts      PTY processes behind the shell panes
    store.ts         session/window state in userData/state.json
  preload/
    index.ts         the whole renderer-to-main API surface
  renderer/
    index.html       CSP + minimal shell markup
    src/main.ts      UI wiring: tabs, live reload, shortcuts, drag & drop
    src/tabs.ts      tab bar rendering + duplicate-name labelling
    src/diff.ts      line diff behind the change highlight
    src/terminal.ts  xterm pane wired to a PTY in the main process
    src/split.ts     the divider between the two panes
    src/markdownRenderer.ts  markdown-it setup, highlighting, task lists, assets
    src/styles.css   document + chrome styling, light and dark
  shared/
    types.ts         types shared across the three processes
test/
  diff.test.ts               line diff, including the coarse fallback boundary
  markdownRenderer.test.ts   change marking, rendering, escaping, path resolution
```

`examples/sample.md` exercises every supported Markdown feature — useful for
checking rendering and live reload.

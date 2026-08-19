# Markdown Viewer

A small live Markdown viewer for Windows. Open several `.md` files from anywhere on
disk, each in its own tab, and see them re-render automatically whenever another
program (an editor, a generator, an AI agent) rewrites the file. Each tab can put a
shell next to the document, so the agent doing the rewriting runs in the same window.

It is a viewer, not an editor — no editing, no file tree, no workspace management.

Where this is heading is written down in [ROADMAP.md](ROADMAP.md).

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

The `?` button in the toolbar shows the same list inside the app; `Esc` or a click
anywhere else closes it.

| Input                     | Action                                    |
| ------------------------- | ----------------------------------------- |
| `Ctrl+O`                  | open Markdown file(s)                     |
| `Ctrl+W`                  | close the current tab                     |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | next / previous tab                   |
| `Ctrl+1` … `Ctrl+9`       | jump to tab by position                   |
| `Ctrl+R`                  | force reload of the current file          |
| `Ctrl+D`                  | switch theme: Auto → Light → Dark         |
| ``Ctrl+` ``               | show or hide the shell pane               |
| `Ctrl+Shift+C` / `Ctrl+Shift+V` | copy / paste inside the shell       |
| `F12`                     | toggle DevTools                           |
| middle-click a tab        | close it                                  |
| right-click a tab         | reload, close, close others, copy path, reveal in Explorer |
| drag & drop               | drop `.md` files into the window to open them |

Panes follow what a multiplexer user already knows — **Ctrl acts on tabs, Alt acts on
panes**, with tmux's arrows and `z`:

| Input                     | Action                                    |
| ------------------------- | ----------------------------------------- |
| `Alt+←` / `Alt+→`         | move focus to the pane in that direction  |
| `Alt+1` / `Alt+2`         | focus the shell / the document            |
| `Alt+Shift+←` / `Alt+Shift+→` | move the divider by 5 %               |
| `Alt+Z`                   | zoom the focused pane to the whole tab, and back |

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
- **Shell pane.** ``Ctrl+` `` splits the tab: a shell on the left, the document on
  the right, with a divider that moves by mouse or by keyboard. Either pane can be
  zoomed to the whole tab and back. The shell starts in the document's own
  directory, so builds and agents run where the file lives. One shell per tab, kept
  alive while the tab is open — hiding the pane or switching tabs does not disturb a
  process running inside it; closing the tab kills it. Whether the pane is open and
  how wide it is are remembered per document.
- **Activity dot.** A tab you are not looking at shows a dot: muted while output is
  flowing, green once it has finished, red when it rang the bell, failed or its shell
  died. Where a program reports its own state - Claude Code and anything else that
  emits the `OSC 9;4` progress sequence, the one that drives the spinner in a Windows
  Terminal tab - the dot follows that report and is exact. Everything else falls back
  to a guess: quiet for two seconds counts as finished. The two are kept apart
  internally so the guess never overrules the report, and the tooltip says which one
  you are looking at. A document rewritten in the background lights the same dot.
  It clears when the tab is on screen - a tab whose shell pane is hidden keeps
  collecting, because nothing that happened in it was visible.
- **Deleted files** stay open and marked *unavailable*; they reload by themselves
  if the file reappears.
- **Duplicate names.** Tabs show the file name, extended with as many parent
  directories as needed to stay unambiguous.
- **Theme.** The toolbar button (or `Ctrl+D`) cycles Auto → Light → Dark. *Auto*
  follows the Windows setting; the other two force the palette. The choice is
  applied through `nativeTheme.themeSource`, so it also covers native chrome such
  as scrollbars and dialogs, and it is remembered between launches.
- **Session.** The list of open files and the active tab are stored in
  `%APPDATA%/md-viewer/state.json`, together with the window geometry, and restored
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

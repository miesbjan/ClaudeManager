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
| `Ctrl+G`                  | type where to go: a directory, by path     |
| *Open folder*             | open a directory as a place to work in    |
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
| `Ctrl+C` / `Ctrl+V`      | copy the selection or interrupt / paste, in the shell |
| `F12`                     | toggle DevTools                           |
| click a path in the shell | open the file it points at, at that line   |
| drag a tab sideways       | move it along the bar                     |
| right-click in the shell  | paste, or copy what is selected           |
| middle-click a tab        | close it                                  |
| right-click a tab         | reload, close, close others, copy path, reveal in Explorer |
| drag & drop               | drop `.md` files into the window to open them |

Panes follow what a multiplexer user already knows — **Ctrl acts on tabs, Alt acts on
panes**, with tmux's arrows and `z`:

| Input                     | Action                                    |
| ------------------------- | ----------------------------------------- |
| `Alt+←` / `Alt+→`         | move focus to the pane in that direction  |
| `Alt+1` / `Alt+2` / `Alt+3` | go to the shell / document / dev server, opening it if it is not up |
| `Alt+Shift+←` / `Alt+Shift+→` | move the divider by 5 %               |
| `Alt+Z`                   | zoom the focused pane to the whole tab, and back |
| `Alt+1` / `Alt+2` / `Alt+3`…`Alt+9` | go to: the shell / the dev server / the files as they were opened |
| `Alt+W`                   | right side: the other one of document / dev server |

These are the only keys taken from the shell, the way tmux takes a prefix; Alt with
arrows, digits or `z` is unused by PowerShell and the TUIs that run in it.

While the shell has focus its keys belong to it — `Ctrl+W` deletes a word, `Ctrl+D`
means end of input. The app shortcuts above then answer only to their `Ctrl+Shift`
variants, with `Ctrl+O`, `Ctrl+P`, `Ctrl+T` and `Ctrl+G` as the exceptions: open a file,
which file, another place and which place are what this application is for, and leaving
the shell to ask for one of them defeats the point - so they are taken even though Claude
Code binds all four. Ctrl+Tab and Ctrl+PageUp/PageDown are claimed for the same reason.
See the decision log in [ROADMAP.md](ROADMAP.md) for what that costs. Also unshifted: ``Ctrl+` ``, `Ctrl+Tab`, `Ctrl+=`/`Ctrl+-` and `Ctrl+1`…`Ctrl+9` keep working
from either side. The digits are claimed because what a terminal makes of them is a
handful of control characters nobody types on purpose - `Ctrl+2` is NUL, `Ctrl+3` is
escape - while being unable to leave the pane you are typing in is felt every time.

Files passed on the command line are opened too, so the app works as a handler for
`.md` files (the installer registers the association).

## Behaviour notes

- **The log.** Windows gives a packaged application no console, so the events nobody
  can see are written to `log.txt` in `%APPDATA%\project-console`: a window that died and
  was rebuilt, a shell started, taken over or ended and why, a page in the pane that
  crashed. One line each, the last 200 kB kept, every failure to write ignored. It is
  the first place to look when an agent disappears - "it just crashed" is otherwise
  a report with no evidence behind it. It also records the half of the story only the
  window can see: a terminal built or thrown away, a size sent to a shell, an address
  typed into the pane, and anything the window itself failed at - an error or a dropped
  promise has nowhere else to go in a packaged application.

  `Ctrl+Shift+L` adds what each shell has printed, one file per shell beside the log.
  That is the one thing a screenshot cannot show: a program that draws a screen clears
  up after itself on the way out, so the pane can look like a shell nobody ever used
  while the last words of whatever died are still in the buffer.
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
- **Catch me up.** Beside Run, and on `Ctrl+Shift+U`: what has been happening in this
  place, in a box. It asks the agent - the application has no model in it and starts
  nothing by itself - by running the same CLI the user runs, in print mode, in the
  place's own directory, and shows what comes back as five points of *Done* and five of
  *Next*. The question asks for the language of what the thing does rather than which
  files changed, because a list of files is what you can already get from git and is not
  what somebody returning after a week is missing.

  It runs in plan mode, which may read anything and write nothing: a summary that
  changes what it summarises is not a summary. The question goes in through the
  command's input rather than as an argument - what is on PATH is a `.cmd` shim, which
  Windows only runs through a shell, and a shell would take a sentence with quotes in it
  apart. It costs tokens off the same allowance the status bar counts, so it happens on
  a press and never on its own.
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
  page beside the document. A different address printed later, when a page from this tab
  is already on screen, is mentioned in the status bar rather than taken: a server
  announces itself once and everything after that is an agent or a log mentioning a URL,
  which used to throw away the running application to show a path nobody asked for. A run started from the Run button opens it by itself,
  since starting something means wanting to look at it. The right side shows one of the
  two at a time: `Alt+W` is the other one, `Alt+2` is the document and `Alt+3` the
  server, and which one it was is remembered per place.

  There used to be a third arrangement with both at once, reached by one key cycling
  through all three - which is no answer to "show me the server", since it takes one
  press or two depending on a state you cannot see. Two arrangements need no counting,
  and room for both at once turned out to be worth less than swapping in one keystroke.

  A page shown here runs in a process of its own, in a session of its own, and that is
  deliberate: as a frame of this document it was same-site with the app, shared this
  window's process, and a dev server that ran out of memory took the whole console down
  with it - terminals, running agents and all. Now the page dying is a message in the
  status bar and a `↻` away from being back.

  Its own process also means its own keyboard: once you click inside it, it keeps every
  key you press. Keyboard navigation therefore stops at the edge of the pane - `Alt+3`
  focuses the pane, not the page - and `Alt+W` is additionally held as a system
  accelerator while the window has focus, so there is always one key back out.

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
  be a different application. The page is sandboxed, has no preload and no Node, is
  refused an address that is not local - both when the pane attaches it and when the
  page tries to navigate itself - and anything it opens in a window goes to the system
  browser rather than into the pane.
- **Shell pane.** ``Ctrl+` `` splits the tab: a shell on the left, the document on
  the right, with a divider that moves by mouse or by keyboard. Either pane can be
  zoomed to the whole tab and back. The shell starts in the document's own
  directory, so builds and agents run where the file lives. A shell also starts at the
  size of the pane that asked for it, which matters more than it sounds: everything an
  agent draws is drawn to the width the shell believes in, and a shell that believes the
  wrong one draws a screen that does not fit and repaints - losing what was above - the
  moment anything corrects it. One shell per tab, kept
  alive while the tab is open — hiding the pane or switching tabs does not disturb a
  process running inside it; closing the tab kills it. Whether the pane is open and
  how wide it is are remembered per document.

  A shell also outlives the window it is shown in. It runs in the main process, so
  when the window has to be rebuilt - a saved file in development, a renderer that
  died - the pane takes its shell back by tab id and replays what it printed in the
  meantime, and an agent mid-conversation comes back where it was. That id is written
  into the session file rather than handed out again in file order, because a name given
  out in order points at a different tab as soon as one is closed or two are reordered -
  and the shell would follow the name.

  A shell that ends stays on the screen it left behind, since the last thing it printed
  is usually why it ended; asking for a shell again - the pane key, Run, sending a
  prompt - starts a new one in its place. And the shell follows its place: taking over
  an empty tab with a directory restarts the shell there, unless something is running in
  it, which is nobody's to end. Shells that no tab
  claims afterwards are ended, which is the part that used to be done by killing all
  of them. A rebuilt window says so in the status bar rather than quietly
  rearranging itself, and what happened is in the log described below.
- **Both dialogs open where the tab already is.** A tab is a directory with a shell in
  it, so the file being looked for is nearly always in that directory or below it -
  starting anywhere else means clicking back to it every time, and the place the system
  remembers is wherever some other dialog happened to end. A tab that is no place yet
  gets the system's answer, which is then the best one available.
- **Copying and pasting in the shell.** `Ctrl+V` pastes, and so does the right button -
  which copies instead when something is selected, the way a Windows console does.
  `Ctrl+C` is both things at once: with something selected it copies and clears the
  selection, with nothing selected it is the interrupt the shell has always had. That is
  what Windows Terminal and the terminal in VS Code do, and it is what fingers expect;
  clearing the selection is what keeps the next `Ctrl+C` an interrupt again. `Ctrl+Shift+C`
  copies unconditionally, and `Ctrl+Shift+V` still pastes for fingers that learned it
  elsewhere.

  Ctrl+V used to go to the shell as the control character it is, which every agent
  running in the pane ignores - so pasting looked broken. It is claimed here now, and
  the browser's own paste into the hidden textarea is suppressed at the same time,
  because otherwise the clipboard arrives twice.
- **A new place.** `Ctrl+T`, or *+ New tab* in the toolbar - the key had it to itself,
  which is fine for anyone who knows the key and invisible to everyone else. The three
  buttons run widest to narrowest: a place to work, a directory to work in, a file to
  work on. Open file used to sit in the middle, between the two that both make a place.
  A new tab
  comes with its shell already open, because a place is opened in order to work
  somewhere and there is nothing else in it yet; the shell starts in the home directory
  since the tab belongs to no project until a file is opened in it. Until then the tab
  is labelled *New tab*, and an empty tab is not remembered between launches - there is
  nothing in it to restore, its shell having ended with the window.
- **Reordering tabs.** Drag one sideways and it swaps as it passes its neighbours.
  It is done on the mouse rather than with the HTML drag API, which would hand the tab
  to the operating system - and a tab here is a place with a shell running in it, not
  something to drop on the desktop or tear into a window of its own. Nothing leaves
  the bar. What moves is only the order they are shown in: the tab you were looking at
  stays the one you are looking at.
- **Questions are answered from the keyboard.** The arrows move between the answers, the
  way they do in a native message box, `Enter` takes the one that is on, `Esc` takes the
  safe one - which is where the keyboard starts, since Enter on a question nobody read is
  a refusal.
- **Questions are asked in the window.** Every confirmation - a tab with something
  running in it, unsaved edits, closing the window, quitting from the tray - is drawn by
  the app in its own typeface and palette, not by a system message box with the name of
  the executable in its title bar. They also no longer stop the world: `window.confirm`
  and the native box both freeze the renderer, which meant the shell output stopped
  arriving and a tab's light stopped moving exactly while somebody was deciding whether
  something was still running.

  The two questions the main process needs answered are still its own - it owns the
  window and the shells - so it sends which question, and the window draws it and sends
  back which button. The system box remains as a fallback for a renderer that cannot
  draw: if the window has not reported the box on screen within a second and a half,
  the system asks instead. That wait is for the drawing, never for the answer, or a
  person reading the question would end up with two copies of it.
- **Closing the window.** With an agent recognised in some tab the cross hides the
  window instead of ending the application, so a job halfway through is not killed by
  the click that tidies the desktop; the tray icon brings it back. With nothing running
  anywhere it ends the application as it always did.

  In between there is a third case, and it is the reason the decision is not left to
  recognition alone: a shell is running that was not recognised as an agent. Recognising
  one is done by the strings its interface prints, which is fragile on purpose - for the
  dot on a tab that fails safely, since the light goes out rather than lying, but for the
  window it would mean ending a session over a reworded banner. So an unrecognised shell
  is a question: close and stop it, or keep it running. The shells are counted by the
  main process, which owns them, rather than reported from the window.

  Anything destructive waits for the moment a quit can no longer be refused: unsaved
  edits cancel the close, and a quit whose shells were already torn down would leave the
  window back on screen with dead agents.
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

  Asked once a minute the endpoint starts answering 429, so a reading counts as
  current for five minutes, a rate limit is met with a quarter of an hour of silence,
  and the last good reading stays on screen for up to an hour rather than the gauges
  vanishing. It is also kept beside `state.json`, because otherwise a restart begins
  blind - and a restart during a refusal means an empty status bar until it relents - with the time it was taken added to the tooltip once it is no longer
  current. The reset times inside a kept reading stay right on their own, which is
  what makes a stale gauge worth more than an empty one.

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
- **The number on the taskbar button.** How many tabs are waiting for you, coloured by
  the most urgent of them. It is a counter rather than a notification, so it is true
  whether or not the window is in front of you, and it drops by one as you visit them:
  being in a tab is the acknowledgement, and looking at the window is not - a glance at
  one tab says nothing about the other two.

  What counts as a finish is deliberately narrow, because the badge is worthless the
  moment it cries wolf. A program's own report is believed outright. A run that followed
  a command somebody submitted is believed too - pressing Enter in a shell is a statement
  of intent that no repaint can imitate, and it keeps vouching for five minutes, since a
  shell never says when it is done and one command is two runs whenever it is quiet in
  the middle. Everything else has to have lasted longer than a redraw does. A TUI
  repainting its input box, a prompt redrawing after a resize, or oh-my-posh printing on
  return are none of the three, and they used to put the number back seconds after every
  acknowledgement.
- **Activity dot.** A tab you are not looking at shows a dot: muted while output is
  flowing, green once it has finished, amber while the agent is asking for permission
  and can go no further, red when it rang the bell, failed or its shell fell over.
  A shell closed on purpose - `exit`, code 0 - leaves no dot at all; a red one there
  would be crying wolf. Work in progress turns, the way every spinner does; nothing
  else on a tab moves, so the one thing that does is the thing to look at.

  There is a dot at all only where something has spoken for itself: an agent's own
  interface on screen, or a program reporting progress with `OSC 9;4`, the sequence
  that drives the spinner in a Windows Terminal tab. A shell sitting over a directory
  gets none, because the question behind the light is what the agent is doing and
  there is no agent - a green light there answered nothing that was asked.

  Claude Code is recognised by its interface text, not by that sequence: it does not
  emit one. That was checked rather than assumed - the string does not occur anywhere
  in its binary, while the labels of its permission dialog do. It is fragile in the
  same way they are, and fails the same way: the light stays off rather than lying -
  which it duly did the first time, when only the welcome banner and the shortcut hint
  were looked for. A session started in a directory it already trusts prints no banner,
  and the hint gives way to the mode line as soon as anything is typed, so the mode
  line is watched for as well, by its wording and by the glyph it opens with.

  Where a program does report progress the dot follows that report and is exact.
  Everything else falls back to a guess: quiet for two seconds counts as finished. The two are kept apart
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
- **Typing where to go.** `Ctrl+G` is the keyboard way to the same thing as *Open
  folder*: type `~/source/project` and press Enter. `~` is home, a bare name or `../` is
  relative to where the tab is now, and the directories inside whatever has been named so
  far are listed as you type - `Tab` completes to the highlighted one. The resolved path
  is shown at the bottom, so what will happen is visible before Enter.

  It doubles as a very light file browser, because an arrow and a key sometimes beat
  typing a name out: the arrows walk the list, `Tab` goes into the highlighted directory,
  `Shift+Tab` goes back up, and `Enter` is for when you have arrived. `Enter` deliberately
  does not descend - it means the same thing here as in every other field in the app - and
  what `Shift+Tab` climbs is the directory being listed, so a half-typed name is left
  behind, which is what going up means.

  A bare word with no slash in it is also handed to `zoxide`, if the machine has it, and
  its answers are listed as *often visited* - so `atlas` finds `C:/work/ATLAS` without
  the path being typed at all. It is asked, never told: nothing is ever written to its
  database, which belongs to the shell. A machine without zoxide simply gets the
  directory listing, which is the whole feature anyway.

  `Ctrl+T` needs none of this: a new tab starts in the place you were in, the way a new
  terminal tab does. A tab that is nowhere has a shell in the home directory and nothing
  for `Ctrl+P` to search, which was the one thing left that made an empty tab useless.
- **A tab over a directory.** *Open folder* - or a folder dropped into the window -
  makes a tab that is a place with nothing open in it yet, and with its shell already
  running: a place is a directory and the shell in it, so arriving somewhere and then
  having to ask for the shell was two gestures for one intention. The directory is what
  the shell starts in, what `Ctrl+P` searches, what Run detects a project from, and what
  the tab is called. Opening a file into that tab does not move it: the place was chosen, not
  derived, so it outranks the file's own directory everywhere.

  Such a tab is remembered with nothing in it, which is the part that had to change in
  two places: a tab with no files used to be dropped both when reading the session file
  and when restoring it in the window. A tab that is a directory holds nothing by design,
  and the directory is the one thing it is.
- **Going to a pane opens it.** `Alt+1`, `Alt+2` and `Alt+3` are "take me to the shell,
  the document, the dev server" - so they bring that pane up rather than doing nothing
  when it is not on screen. `Alt+3` is therefore the one key for "show me the server",
  even from a tab that was showing only the document; `Alt+1` opens a shell that was
  closed. Nothing is taken away for it: the right side goes to showing both.
- **Opening a file shows it.** If the right side was on the dev server, or a pane was
  blown up to the whole tab, opening a document used to do everything except put it on
  screen: the tab was renamed, the window title changed, the status bar said it was
  loaded, and the document sat behind the server. The server is not taken away for it -
  the right side goes to showing both, one `Alt+W` from either arrangement.
- **Where you were.** Each file remembers its scroll position, and remembers it twice:
  once for the rendered document and once for the plain-text pane. They measure different
  things - a place in a layout and a place in the text - so keeping one number would land
  you somewhere random after switching how the file is shown.
- **Files in a tab.** A tab is a place - a directory, its shell, its dev server - and
  it holds however many files you open while working there, one of them on screen.
  The same file may be open in more than one place: two tabs over one project is a
  thing people do, and being dragged to the other one instead of opening it here was a
  leftover from when a tab was a file. Every copy follows the file - a rewrite on disk
  reaches all of them, and closing one leaves the others watched. Two copies showing
  the same file both keep the plain name; the way to tell them apart is to name one.
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
- **Go to file.** `Ctrl+P` offers what is open in this tab and what this place keeps -
  the files opened in this directory before - and once you type anything, every file in
  the project.

  The kept list is what makes a project opened next week start where it left off: nothing
  is starred by hand, because a favourite that has to be marked is wrong the first time
  somebody forgets to mark it. What was opened here is remembered, most recent first,
  twenty files per place, and a file that has since been deleted or renamed is dropped
  rather than offered. It lives in `places.json` beside the session and not in it: the
  session is what is open now, this is what has been open here, and losing one should
  never mean losing the other. An empty query is therefore also the answer to
  "what do I have open here", which is why the tab bar has no second row listing them.
  A file open in another tab still shows up - it is a file of the project - but its row
  says so and `Enter` goes there instead of opening a second copy of it. Matching is a
  substring of the file name, or of the path once the query contains a `/`, which is how
  five files called `index.ts` are told apart. Deliberately not fuzzy: scoring guesses
  and then needs tuning, and this is not that feature. While the shell has focus the key
  is `Ctrl+Shift+P`, because plain `Ctrl+P` there belongs to the shell.
- **Naming a tab.** Double-click its label, or right-click it, and give the place a
  name of its own - what you are doing there usually describes it better than whichever
  file is on screen. It is shown as a plain name - it is what the place is called now,
  not a note about the file it came from. An empty name goes back to being named after
  the file, and the name is remembered with the rest of the place.
- **A tab that is busy is not closed on one click.** Closing one where something is
  running - output flowing, the program reporting work, or an agent stopped at a
  permission question - asks first. The cross sits a few pixels from where a tab is
  dragged, and behind it may be an agent halfway through a job. A tab that has
  finished, gone quiet or fallen over closes at once: asking there would turn the
  question into a reflex, and a reflex protects nothing. Closing every other tab asks
  once about however many of them are busy, not once each.
- **Closing the window leaves it running, when there is something to leave.** With an
  agent in one of the tabs - working or idle at its prompt - the cross hides the window
  into the tray and the application carries on: an agent halfway through a job would
  otherwise be killed by the same click that tidies the desktop. With no agent anywhere
  the cross ends the application as it always did, since what closing costs then is a
  shell at a prompt, and everything else is in the session file. Clicking the tray icon - or
  starting the application again, from the shortcut or a `.md` file - brings the window
  back with everything as it was: the same shells, their scrollback, whatever ran while
  nobody was watching. The tray icon carries the same badge as the taskbar button, so
  the count is still readable with no window on screen.

  Quitting is a separate act, from the tray menu, and asks first. This buys exactly one
  thing - surviving the window - and no more: the shells live in the application's own
  process, so quitting, logging out or rebooting still ends them. Sessions that outlive
  the application would need a process of their own to live in, which is a different
  program. What is not lost either way is the conversation: `claude --continue` in that
  directory picks it up from the transcript.
- **Unsaved edits cannot be lost quietly.** Closing a file, a tab or the window asks
  first. The window is refused rather than asked, because a dialog raised while the
  window is already closing proved unreliable; the status bar says what to do.

  They also survive the window itself. A draft is kept in the session file as it is
  typed, the way a half-written prompt is, and comes back with a note saying it is still
  unsaved. That guard does not stop the window being rebuilt - measured, not assumed -
  and after a crash there is nobody left to ask, so the only way to keep an edit is to
  have written it down before. One longer than 200 kB stays on screen only: losing the
  end of an edit quietly would be worse than not keeping it.
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

  The badge is an overlay, `setOverlayIcon`, which is the one mechanism the taskbar
  keeps up to date - and which chooses the corner itself. Painting the badge into the
  icon and setting that as the window icon allows any corner and did work once, but the
  taskbar holds on to the icon it first associated with the executable and ignores what
  comes later, so the number froze at whatever it happened to be. A corner chosen by
  the system beats a number that stops being true.

  Two more things to know: Windows caches the icon of an executable per path, so a
  build replacing an older one at the same path can keep showing the old icon until the
  cache turns over, and while running from source all Electron apps share one taskbar
  button, which makes the badge unreliable in `npm run dev` and correct in a packaged
  app.
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
- the web pane shows this machine and nothing else. The address is checked against a
  fixed list of local hostnames in the renderer, and again in the main process when the
  pane attaches the page and whenever that page tries to navigate; `frame-src` in the
  CSP repeats the list as a third fence and `test/web.test.ts` fails if it drifts
- the page is not part of the application. It is attached with no preload, no Node
  integration and a sandbox, in a storage partition of its own - which is also what
  puts it in a process of its own, so it can neither reach into this window nor take it
  down. Pointing the pane at the app's own dev server on port 5173 is no longer a way
  to be handed the preload API
- the clipboard is read on one occasion only, when you paste into the shell

## Layout

```text
src/
  main/
    index.ts         Electron main: window, IPC, protocol, security policy
    fileWatcher.ts   chokidar watchers + poll fallback for arbitrary file paths
    terminal.ts      PTY processes behind the shell panes
    store.ts         session/window state in userData/state.json
    log.ts           one line per invisible event, in userData/log.txt
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

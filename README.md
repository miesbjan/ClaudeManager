# Claude Manager

A small console for one project at a time, on Windows. A tab holds a shell, the live
document you are steering by, and the app you are building - side by side in one
window.

Claude does the work in the shell; you steer by a document and watch the thing being
built. Those three belong to one project, so they belong in one window - and nothing
else does. It is not an editor: no editing beyond a line at a time, no file tree, no
workspace management. The editor stays the editor, and the agent stays a process
running outside this application, which has no model in it and starts nothing by
itself.

What makes it a tool rather than a layout is that the window notices things. The
document reloads itself and marks what changed. The tab says when the agent in it has
finished or is waiting for permission, the taskbar button says it while the window is
behind something else, and the status bar says what the session has spent. Watching an
agent is the part of the work a terminal is worst at, and it is the part this was
built for.

## Status

A personal tool, built in the open: used every day on Windows, by one person, with the
agent it was built to watch. There are no releases, no support and no promises about
the next commit - if it is useful to you, fork it and make it yours. Windows only; the
shell is a real console through ConPTY, and nothing here has ever run anywhere else.

The shell is an ordinary console, so anything runs in it - but four things are tied to
Claude Code by name and are what the title claims: the gauge that reads what is left of
the subscription, what a session has spent, *Catch me up*, and telling "finished" apart
from "waiting for permission", which is recognised from what Claude Code prints. With
any other agent the window is still a window; those four go quiet.

Licensed under the [MIT licence](LICENSE): do what you like with it.

## Get it running

```bash
npm install
npm run dev          # development
npm run build        # installer + portable exe in ./release, and a desktop shortcut
```

`npm run build` finishes by putting a shortcut on the desktop pointing at the freshly
built app, so it is always the newest one you start. Close the app before rebuilding:
it runs straight out of `release/win-unpacked`, and Windows holds those files while it
is open.

`node-pty` is the only native dependency and ships prebuilt binaries, so there is no
compiler and no `node-gyp` in the way.

## The first ten minutes

**Open a place.** *Open folder* in the toolbar, or `Ctrl+G` and type the path. A tab is
a directory: it comes with its own shell already running in it, and it keeps the files
you open there. That is the unit everything else hangs off.

**Start the agent** in the shell like anywhere else - it is a real console. The pane is
already there; ``Ctrl+` `` hides and shows it.

**Open what you are steering by** with `Ctrl+O`, or `Ctrl+P` to go to a file by name.
Both look in the tab's own directory first. The document re-renders itself whenever
anything on disk rewrites it and tints for five seconds what changed, so you can follow
an agent editing it without rereading the file.

**Run the project.** When the open document belongs to a project - a `package.json` or
a `.csproj` somewhere above it - the shell pane offers one button, and the shell starts
in the project root rather than where the document sits. When the dev server prints an
address, the page appears on the right, in the app rather than in a browser tab you
then have to find again.

**Look away.** This is the point of the thing. A tab you are not on shows a dot: muted
while output is only scrolling past, bright when the agent has finished or is waiting
for permission. The taskbar button carries the same count while the whole window is
behind something else. `Ctrl+Shift+U`, or *Catch me up*, says in a box what happened
while you were gone.

**Open a second place** with `Ctrl+T` and the two run side by side, each with its own
shell, its own files and its own dot.

## The keys worth knowing

`Ctrl` acts on tabs, `Alt` acts on panes - the way a multiplexer user already expects.

| Input                | Action                                                      |
| -------------------- | ----------------------------------------------------------- |
| `Ctrl+G`             | go to a directory, by path - a new place to work in         |
| `Ctrl+T`             | a new place                                                 |
| `Ctrl+O`             | open a file, starting in this tab's own directory           |
| `Ctrl+P`             | go to a file by name: open here, or anywhere in the project |
| `Ctrl+W`             | close the file; the last one closes the tab                 |
| `Ctrl+Tab`           | next tab (`Ctrl+1`…`Ctrl+9` by position)                    |
| `Ctrl+F`             | find in the document                                        |
| ``Ctrl+` ``          | show or hide the shell                                      |
| `Alt+1`              | go to the shell                                             |
| `Alt+2` / `Alt+3`    | go to the dev server / the first file (`Alt+4`… the rest)   |
| `Alt+W`              | on the right: the other one of document and dev server      |
| `Alt+Z`              | zoom the focused pane to the whole tab, and back            |
| `Alt+P`              | compose a longer prompt, `Ctrl+Enter` sends it to the shell |
| `Ctrl+Shift+U`       | catch me up on what happened while you were away            |
| `Ctrl+C` / `Ctrl+V`  | in the shell: copy the selection or interrupt / paste       |

Click a path the shell printed and the file opens at that line. Drop `.md` files into
the window to open them. Drag a tab sideways to move it.

The `?` button in the toolbar has the full list, in whichever language is selected,
followed by a note on everything that happens without a key being pressed. It is the
one to reach for rather than this file.

While the shell has focus its own keys mostly belong to it; the handful above are
taken from it deliberately, and [docs/reference.md](docs/reference.md) says which and
what that costs.

## Where the rest is

- **[docs/reference.md](docs/reference.md)** - everything in detail: every key, what
  the app does on its own, the readouts, the security model, and where each piece of
  code lives.
- **[ROADMAP.md](ROADMAP.md)** and **[PREHLED.md](PREHLED.md)** - where this is heading,
  what it will deliberately never do, and a decision log saying why each thing is the
  way it is. **These two are in Czech**; the code, its comments and this file are in
  English.
- `npm test` - Node's own test runner over the `.ts` files directly, no framework and
  no build step in the way.

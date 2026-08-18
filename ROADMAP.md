# Roadmap

Where this project is going, and — just as importantly — where it is not.

## What this is

Today it is a live Markdown viewer. The intent is to grow it into a **project
console**: one tab per working directory, holding a shell where an agent runs, the
document you are steering by, and a couple of buttons for the commands you keep
typing.

The load-bearing insight: **the intelligence is an external process.** Claude Code
runs as a CLI in a terminal pane. This app never has to be smart — it is the window
around something that already works. That is what makes a three-day build realistic
instead of absurd.

So this is not "a small Cursor". It is the 5 % of an AI editor that actually gets
used in an agent-driven workflow, plus three things no editor has.

## Why not VS Code or Cursor

Both can produce the same layout — terminal, Markdown preview, tasks, git diff — and
adopting one costs nothing to build. They were considered and rejected deliberately:

- **VS Code**: does everything, which is the problem. The goal is a small window
  with four things in it, not an IDE with four things visible.
- **Cursor**: its value is its own AI layer — indexing, completion, in-editor agent.
  In this workflow the agent is the Claude Code CLI, so that layer goes unused and
  what remains is an editor acting as a window.

What neither of them does is supervise an agent: show what it just rewrote, tell you
which of five sessions is waiting for an answer, or let you compose a prompt
comfortably. Those three are the actual reason to build this.

Accepted in exchange: roughly three days of work now, a few hours of maintenance a
year, and a terminal that will be slightly rougher than a dedicated one (see Risks).

## The model: a tab is a directory

One tab = one working directory. The shell's `cwd`, the document paths and the build
commands all derive from it. One unifying concept, no extra state.

```text
┌─ myproject ──────────────── other-project ──────────────┐
│ ┌──────────────────────┬────────────────────────────┐   │
│ │ claude               │ ROADMAP.md (live)          │   │
│ │ > implement step 3   │  ## Phase 2                │   │
│ │                      │  - [x] watcher             │   │
│ ├──────────────────────┤  - [ ] split view          │   │
│ │ ▸ build  ▸ test      │                            │   │
│ │ exit 0 · 4.2s        │                            │   │
│ └──────────────────────┴────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

Sessions are not restorable — a restored tab remembers its directory, layout and
documents, never a running process.

## Delivery in layers

Each layer ships on its own and gets used for about a week before the next one
starts. The order is chosen so the expensive, irreversible step (a native module)
comes only after the cheap layers have proven the idea.

### L0 — Viewer (done)

Tabs, live reload, safe rendering, session restore, Auto/Light/Dark.

### L1 — Split view

Two panes per tab, draggable splitter, per-tab layout persistence. Documents only,
no shell yet. No new dependencies.

*Done when:* a tab can show two documents side by side and remembers the split
across restarts.

### L2 — Terminal pane

`node-pty` in the main process, `@xterm/xterm` in the renderer, data over the
existing preload bridge. The big step: first native dependency, packaging changes,
keybinding rework.

*Done when:* `claude` runs in the left pane, survives resizing, and closing the tab
kills the process.

### L3 — Tasks

Buttons that run a fixed command in the tab's directory, output streamed into a
pane. Exit code, duration, re-run. Nothing else.

*Done when:* build and test run without switching windows.

### L4 — Drawer

One collapsible panel per tab, closed by default, with a content switcher inside —
so the base UI gains exactly one element, not five.

- git diff, read-only — what the agent actually changed
- change feed — which files were touched in the last minutes
- prompt buffer — compose a long prompt, one key sends it to the terminal
- log tail

### L5 — Workspace config and command palette

A declarative file in the project root describing panes and tasks:

```json
{
  "panes": [
    { "type": "terminal", "command": "claude", "size": 0.5 },
    { "type": "doc", "path": "docs/ROADMAP.md" }
  ],
  "tasks": [
    { "label": "build", "run": "npm run build" },
    { "label": "test",  "run": "npm test" }
  ]
}
```

Commands are strings, never code. Plus `Ctrl+P` for switching tabs, documents,
tasks and layouts — features get a name, not a button.

L5 comes last on purpose: hard-code the layout first, and only make declarative the
three things that turn out to be switched in practice. The other way round produces
configuration for its own sake.

## The three features that justify building this

Everything else on this list is a reimplementation of an editor. These are not:

1. **Change highlight** — after a live reload, briefly highlight the lines that
   changed, so you see what the agent just rewrote without rereading the document.
2. **Tab activity dot** — mark the tab where new output arrived or where the process
   is waiting for input. Essential the moment several sessions run at once.
3. **Prompt buffer** — a text field for composing a longer instruction, sent to the
   terminal with one key. Writing multi-line prompts straight into a TUI is
   unpleasant.

Cheap extras in the same spirit, none of which cost a permanent pixel: branch name
and dirty count in the tab title, and `Ctrl+F` inside a document.

## Closed feature list

The finished product is these and nothing more:

| Area   | Feature                                                         |
| ------ | --------------------------------------------------------------- |
| Base   | tabs bound to a directory, split panes, layout persistence       |
| Base   | live Markdown pane (read-only, sanitised)                        |
| Base   | terminal pane                                                    |
| Base   | task buttons                                                     |
| Drawer | git diff (read-only), change feed, prompt buffer, log tail       |
| Extras | change highlight, activity dot, prompt buffer, `Ctrl+F`, palette |

Adding to this list is a decision, not a detail — it needs a line in the decision
log below.

## Non-goals

Refused on purpose, because each one is the first step towards the thing this
project exists to avoid:

- a text editor, and a file tree to go with it
- extensions or plugins; the config stays declarative
- error parsing from build output and click-through to a line
- git operations (commit, stage, push) — read-only diff yes, driving git no; the
  terminal is right there
- a debugger, language servers, symbol search
- AI inside the app: the agent stays an external process
- a settings UI; a config file is enough

## Risks and accepted costs

- **Native module.** `node-pty` means `electron-rebuild`, `asarUnpack` for the
  binary, and a rebuild on every Electron upgrade. This is the single largest
  one-off cost and it lands in L2.
- **The security model changes.** Today the renderer cannot execute anything; the
  whole design rests on Markdown being display-only. A PTY is by definition an
  arbitrary-execution channel. Two rules keep the boundary honest: no path from
  rendered Markdown may reach the PTY (link clicks, images, none of it), and tasks
  from a project config never run automatically on open — only on an explicit click,
  with the command visible.
- **Keybinding conflicts.** `Ctrl+O/W/D` belong to the shell once the terminal has
  focus. App shortcuts move to `Ctrl+Shift+…`, with routing based on focus.
- **The terminal will be the weak spot.** xterm.js gets to about 95 %; the remaining
  5 % — clipboard behaviour, scrollback, mouse selection, resize edge cases, font
  rendering — is where a dedicated terminal stays better. Accepted knowingly.
- **Scope creep is the real risk**, not any of the above. The discipline is the
  product; the code is the easy part.

## Maintenance policy

- Electron is pinned and upgraded deliberately, twice a year, not on every
  `npm outdated`.
- Dependencies stay countable on one hand. A new one needs a reason written down.
- Every layer must leave the app usable. No half-migrated states between releases.

## Decision log

- **2026-08-18** — Build this rather than adopt VS Code or Cursor. Reason: the agent
  is external, so the app only has to be a window; what is wanted is four things in
  a small window plus three agent-supervision features that no editor provides.
  Accepted cost: ~3 days now, a few hours of maintenance per year, a rougher
  terminal.
- **2026-08-18** — Layer order fixed as L1 → L2 → L3 → L4 → L5, with about a week of
  real use between layers. Config file deliberately last.

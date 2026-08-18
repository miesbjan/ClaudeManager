# Sample document

A quick way to check that every supported Markdown feature renders. Edit and save
this file while it is open in the viewer — the tab should refresh on its own.

## Text

**Bold**, *italic*, ***both***, ~~strikethrough~~, `inline code`, and a
[link to the Electron docs](https://www.electronjs.org/docs/latest).

> A blockquote.
> It can span multiple lines.

---

## Lists

1. First
2. Second
   - nested bullet
   - another one
3. Third

- [x] finished task
- [ ] open task
- [ ] another open task

## Code

```ts
type Tab = { path: string; html: string }

export function labelFor(tab: Tab): string {
  return tab.path.split(/[\\/]/).pop() ?? tab.path
}
```

```bash
npm run dev
```

## Table

| Shortcut   | Action            |
| ---------- | ----------------- |
| `Ctrl+O`   | open a file       |
| `Ctrl+W`   | close current tab |
| `Ctrl+Tab` | next tab          |

## Safety check

The block below is written as raw HTML in the source. It must show up as escaped
text, never execute:

<script>alert('this must not run')</script>

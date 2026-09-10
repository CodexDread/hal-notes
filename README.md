# HAL Notes ◉

**A local-first markdown vault with three ways to work: take notes, learn things, and keep what you learn.** Obsidian-style editing, two-way Google Drive sync, and Gemini AI — built for one particular learner who loves learning and can't stand failure, so everything is designed around momentum instead of grades.

Notes are plain `.md` files in a `HAL Notes` folder in your own Google Drive — readable and editable from Drive on the web or your phone, owned by no third party.

> 📋 **[DECISIONS.md](DECISIONS.md)** records the architecture decisions, incidents, and full roadmap behind the app.

## The three modes

### 📝 Notes
- Markdown editor (CodeMirror 6 — the same editor Obsidian uses) with a synchronized live-preview split
- `[[Wiki links]]` with autocomplete and click-to-navigate, a backlinks panel, `#tags` with a tag pane
- Instant full-text search (SQLite FTS5) plus **semantic search** that matches meaning, not keywords
- Smart capture: after you save, HAL suggests a title, tags, and wiki-links as accept-or-dismiss chips
- Fully usable offline; Drive syncs when you're back (debounced push, Changes-API pull, Dropbox-style conflict copies)

### 🔬 Research
Learning paths, not reports. Tell HAL what you want to learn; it researches the web (Google Search grounding) *and* your own vault, then builds an interactive path:

- Cards unlock one at a time: short chunk → check-in → 2–5 minute micro-exercise
- **Engagement is the metric, not correctness** — no scores, no red, "not quite — here's the interesting nuance" is the harshest feedback gets
- Every path opens with what you *already* know, mined from your notes
- Closes with a one-sitting tiny project, then saves the walked path (your answers included) as a note in your vault
- Notebook chat is Socratic, scoped to that notebook's sources — pinned vault notes plus web sources HAL discovered

### 🧠 Review
Spaced repetition across the whole vault: any note can generate active-recall cards (**🧠 Add to review** in its header), research check-ins join the same pool, and everything resurfaces on a gentle 1/3/7/14/30-day ladder. Skipped is skipped; nothing is graded.

## Setup

```bash
npm install
npm run dev        # launch with hot reload
npm run typecheck  # tsc for main + renderer
npm test           # unit tests
```

Requires Node 20+. Works on Windows and Linux (Arch: install `base-devel` if a native module needs rebuilding).

### Google Drive (optional, recommended)
1. At [console.cloud.google.com](https://console.cloud.google.com): create a project → enable the **Drive API** → OAuth consent screen (add yourself as a test user, or publish unverified to avoid the 7-day token expiry) → create an OAuth client of type **Desktop app** → download the JSON.
2. In HAL Notes: **Settings → Integrations → Google Drive** → paste the secret → **Connect**.

The consent screen's "full Drive access" warning is the OAuth scope needed to watch a folder you also edit from outside the app; HAL Notes only ever touches its own folder.

### Gemini
Free key from [aistudio.google.com](https://aistudio.google.com) — a Google AI Pro/Ultra subscription raises its rate limits. Paste it in **Settings → Integrations → Gemini**, test it, then **Build index** once for semantic search. The key is stored encrypted and only ever used from the local main process.

## Customization

**Settings → Style**: dark/light theme and an accent color that re-skins the entire app (buttons, links, caret, selection, HAL's branding) with contrast preserved in both themes. **Settings → Defaults**: default view, HAL suggestion delay, path length, sync interval.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+N` | New note |
| `Ctrl+S` | Save now |
| `Ctrl+P` | Search |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+J` | Toggle HAL panel |
| `Ctrl+,` | Settings |

## Roadmap to 1.0

Attachments → graph view → vault QOL (drag-and-drop) + theming extensions → AI router (multi-provider) → plugin platform (research & review become plugins; Fountain-style screenplay module) → provider-agnostic backups (Drive/GitHub/self-hosted) → plugin SDK → **installers → 1.0**. Full detail and sequencing rationale in [DECISIONS.md](DECISIONS.md).

Versioning follows semver (minor = feature, patch = fix); 1.0 is deliberately gated on the installers.

## Architecture

```
src/
  main/                 # Electron main process
    store/              # SQLite: notes, FTS5, embeddings, review cards + settings
    drive/              # OAuth loopback flow, Drive v3 helpers, sync engine
    research/           # learning-path engine, Socratic chat, review scheduling
    ai/                 # Gemini client, embeddings + hybrid retrieval, capture
    ipc.ts              # typed IPC surface
  preload/              # contextBridge API
  renderer/             # React + Tailwind + CodeMirror (Notes/Research/Review modes)
  shared/               # types, parsers, pure sync logic (unit-tested)
```

Security posture: contextIsolation + sandbox on, no nodeIntegration, keys never reach the renderer, external links open in the system browser.

## License

MIT

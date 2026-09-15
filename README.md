# HAL Notes ◉

**A local-first markdown vault with three ways to work: take notes, learn things, and keep what you learn.** Obsidian-style editing with live preview, two-way Google Drive sync, and Gemini AI through a plugin platform — built for one particular learner who loves learning and can't stand failure, so everything is designed around momentum instead of grades.

Notes are plain `.md` files in a `HAL Notes` folder in your own Google Drive — readable and editable from Drive on the web or your phone, owned by no third party.

> 📋 **[DECISIONS.md](DECISIONS.md)** records the architecture decisions, incidents, and full roadmap behind the app. **[DESIGN.md](DESIGN.md)** documents the Apollo Avionics visual system.

## The three modes

### 📝 Notes
- **Unified live-preview editor** — markdown syntax hides on lines away from your cursor; the line you're editing shows raw source. Headings styled in accent amber, bold/italic/code/`~~strike~~`/horizontal rules all render inline.
- `[[Wiki links]]` with autocomplete and click-to-navigate, a backlinks panel, `#tags` with a tag pane
- Instant full-text search (SQLite FTS5) plus **semantic search** that matches meaning, not keywords
- Smart capture: after you save, HAL suggests a title, tags, and wiki-links as accept-or-dismiss chips
- **Graph view** — force-directed star chart of your vault's connections
- Fully usable offline; Drive syncs when you're back (debounced push, Changes-API pull, Dropbox-style conflict copies)
- Attachments: paste or drag images/files into notes; synced as binaries

### 🔬 Research
Learning paths, not reports. Tell HAL what you want to learn; it researches the web (Google Search grounding) *and* your own vault, then builds an interactive path:

- Cards unlock one at a time: short chunk → check-in → 2–5 minute micro-exercise
- **Engagement is the metric, not correctness** — no scores, no red, "not quite — here's the interesting nuance" is the harshest feedback gets
- Every path opens with what you *already* know, mined from your notes
- Closes with a one-sitting tiny project, then saves the walked path (your answers included) as a note in your vault
- Notebook chat is Socratic, scoped to that notebook's sources — pinned vault notes plus web sources HAL discovered

### 🧠 Review
Spaced repetition across the whole vault: any note can generate active-recall cards (**🧠 Add to review** in its header), research check-ins join the same pool, and everything resurfaces on a gentle 1/3/7/14/30-day ladder. Skipped is skipped; nothing is graded.

### 📜 Screenplay
A Fountain-format screenplay editor: scene headings, action, character cues, dialogue, parentheticals, transitions — each with proper screenplay alignment. Character and scene autocomplete, scene outline rail, scene/page/character stats, and `.fountain` export. Screenplays are plain notes so they sync to Drive for free.

## Plugins

Research, Review, and Screenplay are **bundled plugins** — mounted through the same API third-party plugins use:

- Toggle any plugin on/off in **Settings → Plugins**; bundled plugins have their own configuration (path length, research depth, recall card count, page-estimate basis)
- Install third-party plugins from a folder: manifest.json with permissions (`ui`, `notes`, `storage`, `ai`, `files`)
- **Plugin SDK**: `npx @hal-notes/create-hal-plugin my-plugin` scaffolds a working plugin; `@hal-notes/plugin-sdk` provides TypeScript types, manifest validation, and version compat checking
- Reference plugin: `packages/hal-plugin-sdk/examples/word-count/` — a complete vault stats dashboard

## AI, your way

**Settings → Integrations** — pick your provider: Google (Gemini), OpenAI, Anthropic, OpenRouter, or any OpenAI-compatible endpoint (Ollama, LM Studio). One master switch controls all AI features; no key registered = no AI surface at all. HAL speaks like HAL 9000 — calm, measured, no contractions, occasionally dry.

Chat history with HAL persists across app restarts (with citations), so you can review past conversations.

## Getting started

### Run from source

```powershell
cd "C:\Users\Al Piatt\Documents\at home projects\hal-notes"
npm run dev
```

### Build installers

```powershell
# Windows NSIS installer (~130MB)
npm run dist:win

# Linux AppImage (must be built on Linux)
npm run dist:linux
```

### Install the release

Download `HAL Notes Setup 1.0.0.exe` from the [releases page](https://github.com/CodexDread/hal-notes/releases/tag/v1.0.0).

Requires Node 20+. Works on Windows and Linux (Arch: install `base-devel` if a native module needs rebuilding).

### Google Drive (optional, recommended)

1. At [console.cloud.google.com](https://console.cloud.google.com): create a project → enable the **Drive API** → OAuth consent screen (add yourself as a test user, or publish unverified to avoid the 7-day token expiry) → create an OAuth client of type **Desktop app** → download the JSON.
2. In HAL Notes: **Settings → Integrations → Google Drive** → paste the secret → **Connect**.

The consent screen's "full Drive access" warning is the OAuth scope needed to watch a folder you also edit from outside the app; HAL Notes only ever touches its own folder.

### Gemini

Free key from [aistudio.google.com](https://aistudio.google.com) — a Google AI Pro/Ultra subscription raises its rate limits. Paste it in **Settings → Integrations**, test it, then **Build index** once for semantic search.

## Customization

**Settings → Style**: dark/light theme and an accent color that re-skins the entire app with contrast preserved in both themes. **Settings → Defaults**: sync poll interval.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+N` | New note |
| `Ctrl+S` | Save now |
| `Ctrl+P` | Search |
| `Ctrl+B` | Toggle file rail |
| `Ctrl+J` | Toggle HAL bay |
| `Ctrl+,` | Settings |

## Architecture

```
src/
  main/                 # Electron main process
    store/              # SQLite: notes, FTS5, embeddings, review cards, chat history, plugin storage
    drive/              # OAuth loopback flow, Drive v3 helpers, sync engine
    research/           # learning-path engine, Socratic chat, review scheduling
    ai/                 # router (multi-provider), embeddings, capture, HAL chat + history
    plugins/            # plugin registry, permissions, per-plugin KV storage
    ipc.ts              # typed IPC surface
  preload/              # contextBridge API
  renderer/             # React + Tailwind + CodeMirror (unified live preview)
  shared/               # types, parsers, pure sync logic (unit-tested)
packages/
  hal-plugin-sdk/       # TypeScript types, manifest utils, version gate
  create-hal-plugin/    # npx scaffold generator
```

Security posture: contextIsolation + sandbox on, no nodeIntegration, keys never reach the renderer, external links open in the system browser.

## License

MIT

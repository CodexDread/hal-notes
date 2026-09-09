# HAL Notes ◉

A personal markdown notes vault — Obsidian-style editing, **two-way sync with Google Drive**, and **Gemini AI** built in (chat with your notes, semantic search, smart capture).

Notes are plain `.md` files living in a `HAL Notes` folder in your Google Drive, so they stay readable and editable from Drive on the web or your phone.

> 📋 **[DECISIONS.md](DECISIONS.md)** records the architecture decisions, incidents, and roadmap behind this app.

## Development

```bash
npm install
npm run dev        # launch the app with hot reload
npm run typecheck  # tsc for main + renderer
npm test           # unit tests (parsers, sync logic)
```

Requires Node 20+ (tested on 24). Works on Windows and Linux (Arch: install `base-devel` if a native module needs rebuilding).

## First-run setup

### 1. Google Drive (optional, recommended)

HAL Notes syncs through your own Google Cloud OAuth client — nothing passes through any third party.

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → create a project (any name).
2. **APIs & Services → Library** → search "Google Drive API" → **Enable**.
3. **APIs & Services → OAuth consent screen** → External → fill in the app name and your email → add yourself as a **test user**. For personal use you can leave it in testing; if the 7-day token expiry annoys you, publish it (unverified is fine for personal apps).
4. **APIs & Services → Credentials → Create credentials → OAuth client ID** → application type **Desktop app** → download the JSON.
5. In HAL Notes: **Settings (Ctrl+,) → Google Drive** → paste the `client_secret*.json` contents → **Save client secret** → **Connect**. Your browser opens, you sign in, done.

The consent screen will warn that the app "can see, edit and delete all Drive files" — that's the OAuth scope needed to watch a folder you also edit from outside the app. HAL Notes itself only ever touches its own `HAL Notes` folder.

### 2. Gemini

1. Get an API key at [aistudio.google.com](https://aistudio.google.com) — free, and a Google AI Pro/Ultra subscription raises its rate limits.
2. **Settings → Gemini** → paste the key → **Save** → **Test key**.
3. Click **Build index** once to embed your vault for semantic search and Ask HAL.

The key is stored encrypted via Electron `safeStorage` and only ever used from the local main process.

## Features & shortcuts

- Markdown editor (CodeMirror 6) with split live preview
- `[[Wiki links]]` with autocomplete + click-to-navigate, backlinks panel
- `#tags` with tag pane and full-text search (SQLite FTS5)
- **Semantic search** — natural-language queries matched by meaning (Gemini embeddings)
- **Ask HAL** — grounded chat over your vault with `[n]` citations
- **Smart capture** — after you save, HAL suggests a title, tags, and wiki-links as accept/dismiss chips
- Two-way Drive sync with Dropbox-style conflict copies; works fully offline

| Shortcut | Action |
| --- | --- |
| `Ctrl+N` | New note |
| `Ctrl+S` | Save now (flushes debounce) |
| `Ctrl+P` | Search |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+J` | Toggle HAL panel |
| `Ctrl+,` | Settings |

## Architecture

```
src/
  main/                 # Electron main process
    store/              # SQLite (notes, folders, links, tags, FTS5, embeddings) + settings
    drive/              # OAuth loopback flow, Drive v3 helpers, sync engine (push/pull/3-way conflicts)
    ai/                 # Gemini client, embeddings + hybrid retrieval, Ask HAL, smart capture
    ipc.ts              # typed IPC surface
  preload/              # contextBridge API
  renderer/             # React + Tailwind + CodeMirror
  shared/               # types, parsers, pure sync logic (unit-tested)
```

Sync model: Drive is the source of truth; a local SQLite-backed cache keeps the app fast and fully offline. Pushes are debounced (~2 s after you stop typing); pulls use the Drive Changes API (default poll: 30 s, on focus, and on demand). Conflicts compare content hashes against the last-synced snapshot and keep both versions — newest wins, loser becomes a `Name (conflict …)` copy.

## Roadmap (v1.1+)

- Image/attachment paste support
- Graph view
- Multi-window / tabs
- `electron-builder` packaging (Windows NSIS + Linux AppImage)

# HAL Notes — Build Plan

An Obsidian-style markdown notes app for Windows + Arch Linux, synced two-way with a folder in your Google Drive, with Gemini AI (chat with notes, semantic search, smart capture) baked in. Named after HAL, your in-vault AI.

## Tech Stack

- **Electron + React + TypeScript** via `electron-vite` scaffolding — same architecture class as Obsidian itself; runs identically on Windows and Arch; packaged later with electron-builder (nsis + AppImage).
- **Editor**: CodeMirror 6 (the editor Obsidian uses) with a synchronized rendered-preview pane (toggleable split view).
- **UI**: Tailwind CSS, zustand for renderer state, dark theme by default.
- **Local store**: SQLite (`better-sqlite3`, ships Electron prebuilds) with **FTS5** for instant full-text search. Local cache lives in `app.getPath('userData')` so the app is fully usable offline; Drive catches up when you reconnect.
- **Drive**: `googleapis` Drive v3 + OAuth 2.0 installed-app flow (system browser → loopback redirect), tokens stored encrypted via Electron `safeStorage`.
- **Gemini**: `@google/genai` SDK, called from the main process only (key never reaches the renderer). Chat model selectable in Settings (dropdown populated live from `models.list`, so model churn never breaks the app); embeddings via Gemini's embedding model for semantic search, stored as BLOBs in SQLite — brute-force cosine similarity is instant at personal-vault scale.

## Architecture

```
src/
  main/                  # Electron main process — all Drive & Gemini work lives here
    drive/  auth.ts (OAuth loopback, token refresh), sync.ts (push/pull/conflicts),
            files.ts (upload/download .md)
    ai/     gemini.ts (client/key), chat.ts (retrieval + streaming), embed.ts,
            capture.ts (smart capture suggestions)
    store/  db.ts (schema/migrations), notes.ts (CRUD + FTS), links.ts (wiki-link graph)
  preload/  contextBridge — typed IPC API
  renderer/ React app: Sidebar/FileTree, Editor+Preview, Backlinks panel,
            Search (FTS + semantic tab), Ask HAL chat, Smart-capture chips, Settings, SyncStatus
  shared/   types shared across processes
```

## Core Behaviors

**Vault model**: plain `.md` files in a `HAL Notes` folder in My Drive (configurable). Folders become the file tree; notes stay readable/editable from Drive web or your phone.

**Sync engine** (Drive = source of truth, local = working cache):
- First run: recursive `files.list` download into local cache + index build.
- Push: debounced (~2s after you stop typing) `files.update`.
- Pull: Drive **Changes API** (`changes.getStartPageToken`/`changes.list`) polled every 30s and on window focus — efficient incremental sync.
- Conflicts: three-way merge base = last-synced snapshot; if both sides changed, keep newest and write a `Note (conflict 2026-09-09).md` copy (Dropbox-style), surfaced in a sync-status indicator.
- Full `drive` OAuth scope (needed to see files you add outside the app), but the app only ever reads/writes inside the HAL Notes folder.

**Gemini features**:
- **Ask HAL**: hybrid retrieval (FTS5 keyword + embedding similarity) picks top-K notes → streamed answer with citations linking back to the source notes.
- **Semantic search**: natural-language queries matched by meaning; embeddings updated incrementally on save.
- **Smart capture**: on save, Gemini suggests title/tags/`[[wiki-links]]` as accept/dismiss chips — never auto-applied.

**Editor (Core Obsidian feel)**: live split preview, `[[wiki-links]]` with autocomplete + click-to-navigate, backlinks panel per note, `#tags` with tag pane, full-text search. Graph view deferred to v2.

## Build Milestones

1. **Scaffold + local vault** — electron-vite project, shell UI (file tree, editor, split preview), SQLite persistence. Usable as a local-only note app at the end of this step.
2. **Obsidian core** — wiki-links + autocomplete, backlinks, tags, FTS5 search pane.
3. **Drive sync** — OAuth onboarding in Settings, initial download, debounced push, Changes-API pull, conflict copies, sync-status UI. Two-way sync verified against Drive web.
4. **Semantic search** — API-key setup in Settings, embedding backfill + incremental updates, hybrid search UI.
5. **Ask HAL + smart capture** — streaming chat with citations; suggestion chips on save.
6. **Polish + package** — theming, keyboard shortcuts, electron-builder targets for Windows and Arch (AppImage).

Testing: unit tests for the sync/conflict and link-parsing logic (pure functions); manual verification for OAuth flows and packaging.

## What you'll need to do (one-time setup, I'll walk you through when we get there)

1. **Google Cloud**: create a free project, enable the Drive API, create an OAuth *Desktop* client, download the secret JSON into the app. Because it's personal-use, we'll publish the consent screen as unverified "production" — otherwise Google expires your login every 7 days in testing mode.
2. **Gemini API key**: free from aistudio.google.com — your AI Pro/Ultra subscription gives it elevated rate limits.

## Known trade-offs

- The OAuth consent screen will show "see, edit, create, delete all Google Drive files" — unavoidable for watching a folder you also edit externally; the app self-restricts to the HAL Notes folder.
- v1 stores plain markdown text files; image/attachment handling is a v1.1 follow-up.
- First semantic-search setup embeds your whole vault (one batched pass, a few minutes for large vaults).
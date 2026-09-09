# HAL Notes — Decisions Log

Working record of what this app is, why it's built the way it is, what went wrong along the way, and what's planned next. Newest thinking is at the bottom of each section. Started 2026-09-09.

## What HAL Notes is

A personal, single-user markdown notes vault in the Obsidian mold, built from scratch to be **local-first, synced two-way with Google Drive, and AI-native through Gemini**:

- Notes are plain `.md` files in a `HAL Notes` folder in the user's own Drive — readable and editable from Drive web or phone, owned by no third party.
- Obsidian-core editing: `[[wiki-links]]` with autocomplete and click-navigation, backlinks, `#tags`, full-text search, split live preview (CodeMirror 6 — the same editor Obsidian uses).
- AI features (chosen for v1): **Ask HAL** grounded chat with `[n]` citations, **semantic search** (embeddings + keyword fusion), and **smart capture** (advisory title/tag/link suggestions after you save).
- Cross-platform: Windows + Arch Linux.

## Decision records

### D1 — Form factor: Electron desktop app
Electron + React + TypeScript via `electron-vite`, over Tauri (would require a Rust toolchain on both machines for heavier builds) and a localhost web app (not a real desktop app). Packaging later via electron-builder → Windows NSIS + Linux AppImage. *(2026-09-09)*

### D2 — Dependency pins
Latest-for-its-time resolution conflicted: `electron-vite@5` peers on vite ≤7 while `@vitejs/plugin-react@6` requires vite 8. Pinned: `vite@^7`, `@vitejs/plugin-react@^5`. TypeScript is 7.x — which removed `baseUrl` from tsconfig (paths are resolved relative to the tsconfig instead). *(2026-09-09)*

### D3 — Storage: SQLite local cache, Drive is source of truth
`better-sqlite3` with WAL. Schema: `notes` (content + sync hashes + `content_version`), `folders`, `links`, `tags`, `embeddings`, `meta`, plus an FTS5 external-content table over notes kept current with triggers. The app is fully usable offline; Drive reconciles when reachable. Note: better-sqlite3 v13 generics are `prepare<BindParameters, Result>` — inverse of the pre-v12 convention. *(2026-09-09)*

### D4 — Sync model
- **Push**: debounced — 700ms renderer save debounce, then ~2s sync-engine debounce after the last save.
- **Pull**: Drive **Changes API** (start-page-token + incremental changes), polled every 30s (configurable), on window focus (throttled 5s), and on demand.
- **Conflict detection**: three-way via content hashes — local hash vs last-synced ancestor vs Drive's `md5Checksum` (Drive reports md5 in listings, so remote-change detection needs no download). Both-sides-changed → newest `modifiedTime` wins, loser is preserved as a `Name (conflict YYYY-MM-DD HH-mm).md` copy that itself syncs up. If both sides converge to identical content, it's clean (no false conflict).
- **Identity**: offline-created rows get `local-<uuid>` ids, swapped for real Drive ids after upload (FKs cascade). Note switching follows id swaps by path.
- **Scope**: full `drive` OAuth scope — required to see files the user adds to the vault folder outside the app — but the engine only ever reads/writes inside the vault folder. OAuth uses the loopback redirect flow (`http://127.0.0.1:<ephemeral>`), refresh token encrypted with Electron `safeStorage` (plain-file fallback where keyring is unavailable).
- Sync is not yet queue-persistent: pending pushes live in SQLite (dirty = `local_hash != synced_hash`), but a pull is needed after restart to catch up; first-run does a full tree reconcile. *(2026-09-09)*

### D5 — Linking model
Wiki-links resolve to notes by **name, case-insensitive**; the `links` table stores lowercase targets. `[[target|display]]` and `[[note#heading]]` supported (heading links open the note only in v1). Tags are inline `#tag` tokens. No YAML frontmatter in v1 — the title is the filename, which keeps notes clean for Drive-side editing. *(2026-09-09)*

### D6 — Gemini integration posture
All AI calls happen in the **main process**; the API key never reaches the renderer and is stored encrypted. The chat model is a setting (default `gemini-flash-latest`, dropdown populated live from `models.list`) so model churn can't break the app. A Google AI Pro/Ultra subscription raises the key's rate limits — that's the "integrates with my subscription" story. *(2026-09-09)*

### D7 — Retrieval: hybrid, no vector DB
Embeddings via `gemini-embedding-001` (768-dim, stored as BLOBs in SQLite, brute-force cosine — instant at personal-vault scale, no infra). Query embedding fused with FTS5 BM25 ranks via reciprocal-rank fusion (k=60). Ask HAL grounds on the top-8 notes with a system prompt requiring `[n]` citations and honesty when the vault doesn't cover the question. Embeddings update incrementally ~15s after saves; backfill is one batched pass. *(2026-09-09)*

### D8 — Smart capture is strictly advisory
Fires after a configurable idle delay (default 12s; 4–20s in Defaults) on notes ≥250 chars, once per `content_version`. Gemini returns structured JSON (`title`, `tags`, `links`); link suggestions are filtered to **exact existing note names and exact substrings of the note** — precision over recall. Suggestions render as accept/dismiss chips and are **sticky per note** (they used to vanish if you switched notes before they arrived — see I4). Never auto-applied: HAL suggests, you decide. *(2026-09-09)*

### D9 — Security posture
`contextIsolation: true`, `sandbox: true`, no nodeIntegration; a typed `contextBridge` API is the renderer's only IPC surface; external links intercepted via `setWindowOpenHandler` → `shell.openExternal`; CSP meta tag in the renderer HTML. *(2026-09-09)*

### D10 — Theming via palette-variable remapping
Tailwind v4 utilities resolve through CSS variables, so: light theme = remapping the zinc scale under `.theme-light` (one block flips the entire UI); **accent color** = one user-chosen hex expanded into a theme-aware 5-shade HSL ramp (different lightness targets for dark vs light so contrast holds) injected as the `violet` variables. CodeMirror swaps themes through a `Compartment`; preview toggles `prose-invert`. This is why Style settings apply live with no restart. *(2026-09-09)*

### D11 — Settings shape
One JSON blob in the `meta` table, broadcast to the renderer on change. UI tabs: **Integrations** (Drive, Gemini), **Style** (theme, accent, editor font size), **Defaults** (default view at launch, suggestion delay, sync poll interval), **Plugins** (reserved, "coming soon"). *(2026-09-09)*

### D12 — Data-loss guards
Autosave is debounced (700ms), but every path that would discard editor state — switching notes, renaming, trashing, note id swaps mid-save (with one remap-and-retry) — flushes first. Lesson burned in by I3 below. *(2026-09-09)*

## Incidents & fixes worth remembering

- **I1 — npm ERESOLVE chain** (2026-09-09): see D2. Also: piping npm output through `tail` masks failures — exit codes lie under pipes.
- **I2 — Electron binary never downloaded**: the package's postinstall was skipped silently; `node node_modules/electron/install.js` fetches it. Symptom: `Error: Electron uninstall` from electron-vite.
- **I3 — Drive Connect hung at "Waiting for sign-in"**: root cause was embarrassing and instructive — `shell.openExternal` was imported but **never called**, so no browser ever opened and the loopback wait just sat there. Fix + hardening: await the call, log the URL, and emit the auth URL to the UI so Settings can always show an "open the sign-in page manually" link.
- **I4 — Switching notes discarded unsaved content**: `open()` replaced `activeContent` without flushing a dirty editor. Fixed with flush-on-switch/trash/rename (D12). Discovered during live testing.
- **I5 — Google OAuth `403: access_denied`**: consent screen in **Testing** mode only admits registered test users. Add your account under *OAuth consent screen → Test users*, or publish to production (unverified is fine for personal use) — which also stops the 7-day refresh-token expiry testing mode imposes.
- **I6 — Gemini `API_KEY_SERVICE_BLOCKED`**: a key minted in Cloud Console without the **Generative Language API** enabled on its project. Cure: create keys at aistudio.google.com, or enable the API / lift key restrictions.
- **I7 — WAL diagnostic trap**: external **readonly** SQLite connections can serve stale snapshots of a live WAL database on Windows — debugging against them makes working code look broken. Always inspect with a writable connection.
- **I8 — electron-vite dev doesn't rebuild main** on this machine (suspected: space in the project path); renderer HMR works. Workflow: restart `npm run dev` after main-process edits.
- **I9 — Smart capture initially invisible**: two silent drop points (non-active-note arrivals, filter-to-empty results). Now sticky per note, and the pipeline logs every skip/filter decision under `[capture]` for diagnosability.

## Roadmap

1. **Installers** (next): electron-builder — Windows NSIS `.exe`, Linux AppImage.
2. **Attachments**: image paste/drag into notes, stored in an `attachments/` folder in the vault, synced as binaries.
3. **Graph view**: wiki-link force graph over the `links` table.
4. **Plugins tab**: extension points — the tab already reserves the seat; likely first candidates are export formats (PDF, HTML) and custom editor tools.
5. Maybe: multi-window/tabbed editing, persistent push queue with retry/backoff, per-note Gemini conversations.

## Operational notes

- Dev: `npm run dev` · checks: `npm run typecheck`, `npm test` (35 tests). Restart dev after main-process changes (I8).
- Secrets on disk (all under Electron `userData`): `drive-tokens.json` and `gemini-key.bin` (safeStorage-encrypted), `client-secret.json` (pastable, semi-public).
- The Google Cloud OAuth client is personal-use; the scary-sounding "full Drive access" consent text is the price of watching a folder the user also edits externally — the engine self-restricts to the vault folder (D4).

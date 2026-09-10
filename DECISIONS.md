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

### D13 — Research mode: learning paths, not reports (2026-09-10)
Research mode exists for **personal learning with failure aversion in mind** — the owner loves learning, struggles with failure, and wants the app as a bridge. The design rules that follow from that, enforced everywhere (prompts and UX alike):
- **Engagement is the metric, not correctness.** No scores, grades, red, or pass/fail anywhere. "Not quite — here's the interesting nuance" is the harshest feedback gets.
- **Start from strength**: every path opens with what the learner's own vault already knows about the topic.
- **Small finishable steps**: cards unlock one at a time; micro-exercises are 2–5 min and nearly fail-proof; the closing "tiny project" is one sitting, and stopping there is framed as complete.
- **Learn by answering**: each card = short chunk + check-in (MCQ or short answer, gently evaluated) + micro-exercise. Active recall over reading.
- **The vault is scaffolding**: cards link to existing notes; completed paths save as notes under `Research/<notebook>/` (synced, searchable, embeddable — future research cites them). Working state (progress, chat history, sources, review schedule) is local SQLite (`research_*` tables, migration v2).
- **Socratic notebook chat** scoped to the notebook's sources; HAL asks questions back but explains plainly when asked.
- **Review sessions** resurface check-ins on a 1/3/7/14/30-day ladder — anti-forgetting without testing pressure. Skipped is skipped.
Mechanics: web research via Gemini Google Search grounding (`tools: [{googleSearch: {}}]`), flash for rounds, configured model for synthesis; path length is a setting (5/7/9 cards). Deferred: interactive pre-path calibration questions, urlContext deep URL reading, cross-machine sync of notebook working state.

### D14 — Review is a vault-wide mode; research follows the app accent (2026-09-10)
Spaced repetition + active recall graduated from a research-notebook tab into a **first-class mode** (Notes | Research | Review). The pool unifies two sources on one 1/3/7/14/30-day ladder: research check-ins (existing) and **note review cards** — any note can generate 2–4 recall cards via the 🧠 *Add to review* button in its header (`review_cards` table, migration v3; regenerating replaces the set; first review due ~a minute later to ride the opting-in momentum). Same no-grading rules as D13. Also: research mode's UI accents now derive from the configured accent color like the rest of the app (it had a hardcoded emerald second theme — poor form).

### D15 — Semver, enforced at commit time (2026-09-10)
The project follows semver. During 0.x: **minor** = new feature, **patch** = fix, bump in the same commit as the change, tag `vX.Y.Z`. **1.0 is deliberately gated on the installers** — the owner's stated close order (attachments → graph → plugins → installers → 1.0). v0.5.0 consolidates the previously unversioned era (0.2 settings tabs/light theme/defaults · 0.3 accent colors · 0.4 research mode · 0.5 vault-wide review); the app reads its version from package.json via `app.getVersion()` rather than hardcoded strings.

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

Installers remain deliberately **dead last** — the final feature implementation before 1.0. Confirmed pre-1.0 lineup (owner's list, 2026-09-10), sequenced for architecture rather than listed order:

1. **0.6 — Attachments**: image/file paste & drag into notes; `attachments/` folder in the vault; binary sync through the existing engine.
2. **0.7 — Graph view**: wiki-link force graph over the `links` table.
3. **0.8 — Vault QOL + theming extensions**: drag-and-drop reorganizing (notes and folders, with the sync engine learning moves), bulk operations; deeper app customization on top of the palette-variable theme/accent system.
4. **0.9 — AI router**: provider abstraction — Google, OpenAI, Anthropic, OpenRouter, and anything OpenAI-compatible (including local Ollama) — behind the current AI surface, with per-provider keys and model pickers. Every built-in AI feature and every future plugin talks to the router, never to one vendor's SDK.
5. **0.10 — Plugin platform + conversions**: the first-party plugin API; **research mode and review mode convert from built-ins into bundled plugins** (the conversion is the API's proof); the **screenplay module** — Fountain-style editor with sluglines, action, character cues, dialogue, autocomplete, and export — ships as the first showcase in-house plugin. With the platform, **AI integration becomes a toggleable capability, default off unless an active key is registered with the app** — no key, no AI surface; key present, one toggle to opt in or out.
6. **Backup interface — provider agnostic** (no fixed priority): a storage-adapter layer for vault snapshots, separate from (and alongside) live Drive sync — backup is a push/pull of the vault, not a working-state mirror. Confirmed targets: **Google Drive** and **GitHub** (private repo — versioned history for free); strong candidates for locally hosted setups: WebDAV/Nextcloud, S3-compatible endpoints (MinIO etc.), SFTP, and a plain local/network folder. Multiple simultaneous backup destinations.
7. **Plugin development SDK** (no fixed priority — rides after the plugin platform, since it wraps that API): a typed SDK package for third-party developers — manifest spec, project scaffold/generator, a dev harness for running and hot-reloading a plugin against a live app, and a versioned compatibility surface so plugins declare which app versions they support.
8. **0.11+ — Whatever the using teaches**: the owner expects the list to grow as the app gets used.
9. **Installers → 1.0**: electron-builder (Windows NSIS, Linux AppImage). The closing act, unchanged.

Sequencing rationale: the AI router precedes the plugin platform so plugins are written against provider-agnostic plumbing; research/review conversion waits for the platform and then serves as its first real test. Version numbers are placeholders — each feature bumps the minor on release per D15.

## Operational notes

- Dev: `npm run dev` · checks: `npm run typecheck`, `npm test` (39 tests). Restart dev after main-process changes (I8).
- Secrets on disk (all under Electron `userData`): `drive-tokens.json` and `gemini-key.bin` (safeStorage-encrypted), `client-secret.json` (pastable, semi-public).
- The Google Cloud OAuth client is personal-use; the scary-sounding "full Drive access" consent text is the price of watching a folder the user also edits externally — the engine self-restricts to the vault folder (D4).

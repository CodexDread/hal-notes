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

### D16 — Attachments (2026-09-10, v0.6.0)
Binary files join the vault. Design:
- **Storage**: bytes live in a local cache dir (`userData/attachments`), not SQLite — the DB tracks metadata + sync hashes only (`attachments` table, migration v4). 25MB cap per file.
- **Serving**: a privileged custom protocol `hal-att://<urlencoded-name>` streams files to the renderer with correct MIME types (CSP allow-listed); no `file://` escapes.
- **Syntax**: `![[name.png]]` embeds images inline in the preview; `![[file.pdf]]` renders an openable 📎 chip (system default app via `shell.openPath`); non-image drops insert `[[name]]` links. `[[` autocomplete now includes attachments.
- **Capture**: clipboard paste and drag-and-drop onto the editor → bytes cross IPC once → file written + row created → embed inserted at the cursor.
- **Sync**: any non-`.md` file anywhere in the vault folder syncs as an attachment (flat namespace; Drive-side duplicate names across folders get suffixed locally). Same hash-based three-way logic as notes; binary conflicts keep both files (`name (conflict …).ext`), remote content wins the original name. Uploads push to a dedicated `attachments/` folder in Drive.
Deferred: attachment management UI (browse/delete from within the app) — delivered early in v0.6.1 after live feedback.

### D17 — Graph view (2026-09-10, v0.7.0)
A force-directed graph over the `links` table: notes as nodes (radius by link degree), resolved wiki-links as edges, and unresolved link targets as faded ghost nodes — missing connections are visible, not hidden. `d3-force` drives the physics (the one runtime dependency added); rendering is hand-rolled SVG so nodes/edges inherit the accent palette via CSS variables. Interactions: drag nodes (live physics), pan by dragging the canvas, zoom at cursor with the wheel, hover to spotlight a node's neighborhood, click to open the note. Toggled from a TopBar button in Notes mode; the graph replaces the whole main area while open. Data comes from one SQL-side assembly (`graph:data`) with deduped undirected edges and no self-loops; the vault re-fetches on change. *(Pan/zoom transforms are applied imperatively per I11 — React never touches the `<g>` transform.)*

### D20 — UI redesign: Apollo Avionics (2026-09-11, v0.10.0)
A skill-driven full redesign (impeccable v4.3 + the design kit from the open agent-skills ecosystem), run before plugin work per the owner's call. Product truth captured in PRODUCT.md (public-later audience; HAL ◉ binding; keyboard-first). The roll dealt **Observatory Atlas**; the owner chose **Apollo Avionics** (IMPECCABLE'S PICK) from the decision page; composition **Standard Panel Stack** (comp A) from three authored plates. The world: engraved plates on blued steel, hairline seams, IBM Plex Sans/Mono, one amber night-lighting accent that **follows the user's configured accent** (the ramp writes `--hal-amber`), semantic lamps, panel-key controls, catalog-entry titles, the eye breathing once on mount. Token layer (`--hal-*`) with a day-plate light theme; all 19 component files reskinned; no feature/IPC/data changes (guardrails held). Full contracts: `.impeccable/surfaces/src-renderer.md`, DESIGN.md.

### D21 — Redesign process record (2026-09-11)
- The impeccable gates (hero 72%, responsive 65%) are tuned for photographic comps; against authored schematic comps with placeholder bars they fight real content (accent-colored wiki-links read as "drift"). The owner, asked once via structured question, chose **"visual pass + recorded decision"** — content regions supersede placeholder bars; gates closed under that recorded downgrade (hero forced with verbatim reason; responsive closed at 61% with notes).
- The authored-comps pipeline needed PNGs (SVG not counted) — headless Chrome rasterized them. font-match cannot fingerprint uninstalled faces; the contract faces (IBM Plex) were recorded as a near-tie candidate (#2 at distance 1.587 vs 1.558) with disclosure.
- Roadmap renumber: plugin platform → 0.11 (placeholder numbers per D15).

### D19 — AI router: provider-agnostic AI (2026-09-11, v0.9.0)
Every AI feature now talks to `ai/router.ts`, never a vendor SDK directly. Providers: **Google** (official SDK, kept — the only path with Google-Search grounding), **OpenAI**, **Anthropic**, **OpenRouter**, and **OpenAI-compatible** (custom base URL; defaults to local Ollama at `:11434/v1`, no key required). Design points:
- Plain-`fetch` transports for the OpenAI-family and Anthropic (no new SDK deps); SSE streaming parsed by a small unit-tested helper; per-provider key storage in one safeStorage-encrypted file (Google's existing key file retained — zero migration).
- Gemini-style `responseSchema` passes natively on Google; on others JSON mode is enforced via `response_format` (OpenAI-family) or prompt instructions (Anthropic) with the schema appended to the prompt.
- **Web grounding stays Google-only** by design — research rounds route through `aiGroundedChat`, which refuses (with a clear message) rather than silently degrading to ungrounded output.
- **Embeddings**: Google or any OpenAI-compatible endpoint; Anthropic/OpenRouter are chat-only. Changing embeddings provider/model changes vector geometry, so the router stamps an `embedding_sig` — a mismatch wipes the index and asks for a rebuild instead of silently mixing dimensions.
- Ask HAL, smart capture, notebook chat, learning paths, card evaluation, and review cards all route through the active provider; per-feature overrides exist only where semantics demand (grounding → Google).
This is the plumbing the 0.10 plugin platform builds on: plugins will call the router, never a vendor.

### D18 — Vault QOL (2026-09-10, v0.8.0)
- **Drag-and-drop reorganizing**: HTML5 DnD in the file tree (notes and folders; drop on a folder or the root zone, ring highlight on the live target, cycle guard server-side). The sync engine learned moves as moves — `remote_parent_id` columns (migration v5) make parent drift detectable, pushes issue Drive `addParents/removeParents`, pulls apply remote moves by rewriting paths, and folder moves re-Drive-move only the folder (Drive relocates children implicitly). No more delete-and-recreate churn on reorganization.
- **Debug console** (born from I11): main-process `console.*` and `unhandledRejection` captured into a 500-line ring and streamed live to a bottom drawer — toggle in Settings → Defaults, opens from a button beside the sync pill. Every `[capture]`/`[drive]`/sync diagnostic the developer relied on is now in the user's hands.
- **Reading width**: Full (scales, per v0.6.3) / Wide (~64rem) / Reading (~70ch) in Settings → Style.
Deferred: multi-select bulk operations — the one 0.8 roadmap item cut for scope; folds into a later minor.

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
- **I10 — Attachment upload failed with `part.body.pipe is not a function`** (2026-09-10): googleapis media uploads require a stream (or string) body, not a Buffer — fixed by streaming via `createReadStream`. Adjacent discovery: after a restart, `initialSync` only pulled; failed pushes from a previous session sat dirty forever. Pull cycles are now self-healing — anything dirty rides every pull. Also shipped: attachments render in the Files tree (open on click, two-step delete), which was originally deferred to 0.8.
- **I11 — The graph pan that wouldn't move (2026-09-10)**: three consecutive "fixes" (pointer capture → window listeners → hit-target rect) failed because the diagnosis loop was poisoned — the pan *state* updated (my stats readout confirmed it) but React's SVG attribute reconciliation never applied the `<g>` transform visually on the owner's machine. Lesson one: **verify pixels, not state** — a mirrored readout can be a liar when the bug lives between state and DOM. Lesson two: **when an interaction misbehaves on SVG in Electron, apply transforms imperatively** (`setAttribute` in the event handler, ref-held view state; React draws content, not position). Node dragging had worked all along because it writes `fx/fy` into the simulation, not attributes. Also recorded: pointer events never fired on this SVG surface at all — mouse events are the reliable baseline here.
- **I12 — The router upgrade wiped the semantic index (2026-09-11)**: D19's `embedding_sig` guard fired on its very first run — no stamp had ever existed, so "missing" read as "changed" and the whole vector index was deleted. Ask HAL then fell back to keyword-only retrieval, which fails natural-language queries outright (every token AND-ed, stopwords and trailing punctuation included — "AI?" matched nothing). Fixes (v0.9.1): a missing stamp is lazily *initialized*, never treated as a change; `ftsQuery` strips punctuation and drops stopwords (falling back to raw tokens if everything was a stopword); and the HAL panel now shows an amber "semantic index not built — Build index" strip so this failure mode announces itself instead of going quiet. Lessons: **migrations that guard configuration drift need a distinct never-set state**, and a silent capability loss must surface where the user stands, not in a settings pane they aren't looking at.

## Roadmap

Installers remain deliberately **dead last** — the final feature implementation before 1.0. Confirmed pre-1.0 lineup (owner's list, 2026-09-10), sequenced for architecture rather than listed order:

1. **0.6 — Attachments**: image/file paste & drag into notes; `attachments/` folder in the vault; binary sync through the existing engine.
2. **0.7 — Graph view**: wiki-link force graph over the `links` table.
3. **0.8 — Vault QOL + theming extensions**: drag-and-drop reorganizing (notes and folders, with the sync engine learning moves), bulk operations; a toggleable **debug console** (Settings on/off; a button beside the sync pill opens a panel showing main-process logs — sync errors, capture decisions, research runs); deeper app customization on top of the palette-variable theme/accent system, including a **maximum reading-width preference** for the preview (scales full-width by default per v0.6.3, with an optional owner-set cap).
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

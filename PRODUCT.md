# Product

<!-- impeccable:product-schema 1 -->

## Platform

desktop (Electron — Windows + Arch Linux; local-first, offline-capable)

## Stack

Electron + React + TypeScript via electron-vite; Tailwind CSS v4 (palette-variable theming); CodeMirror 6; SQLite (better-sqlite3); Google Drive sync; multi-provider AI via in-house router.

## Users

The owner (single user, personal knowledge tool) today; likely published — open-source or shared — around/after 1.0. Design should survive strangers: a README screenshot, a first-run without a guide. The owner is a power user (keyboard-first) and the app's design DNA is tuned to his learning psychology.

## Jobs

- Capture and organize knowledge as plain markdown in HIS OWN Google Drive folder (local-first; Drive is source of truth; plain .md readable anywhere).
- Learn new topics via research mode: HAL researches web + vault and builds interactive learning paths (engagement over correctness — no scores, no red, "not quite — here's the nuance" is the harshest feedback; start from strength; one-sitting tiny projects).
- Retain knowledge via vault-wide spaced review (1/3/7/14/30-day ladder; skipped is skipped).
- Think with AI across the vault (Ask HAL, semantic search, smart capture) — AI is a socket, not a tenant (multi-provider router).

## Meaningfully different position

An Obsidian-class markdown vault whose AI *teaches* (learning paths, no-grading review) rather than recites, synced through the user's own Drive with no vendor lock — built around one learner's failure-aversion psychology. Every mechanic optimizes momentum, not judgment.

## Durable constraints

- Notes stay plain `.md` files in the Drive vault folder (readable/editable outside the app) — never a database silo.
- No-grading rules are product law (D13): no scores, percentages, red, pass/fail anywhere.
- HAL name + ◉ eye mark are binding brand identity.
- Accent-color + dark/light theming system must keep working (users restyle the app).
- Keyboard-first accessibility bar (all actions reachable and visible by keyboard).
- Windows + Arch Linux parity.
- 1.0 gated on installers (roadmap order: plugin platform → backup interface/SDK → installers → 1.0).

## Operating context

Solo-developer project, fast-moving (multiple releases/day during development); DECISIONS.md is the product memory; semver with minor-per-feature.

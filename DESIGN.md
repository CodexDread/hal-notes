# Design

Written at finish (v0.10.0), from the built world. Product truth lives in PRODUCT.md; the direction contract and surface brief live in `.impeccable/surfaces/src-renderer.md`.

## World

**Apollo Avionics** — HAL Notes as mission instrumentation. The vault is operated, not decorated. Chosen from a seven-candidate grounded hand (IMPECCABLE'S PICK over the rolled Observatory Atlas), approved by the owner via the impeccable decision page; composition "Standard Panel Stack" (comp A) approved from three authored plates.

## Tokens

- **Ground** `--hal-ground` #0d0f12 (blued steel); **plate** `--hal-plate` #171a1f, one step up; **plate-2** #12151a recessed. Light theme = day plate: #efe9da / #f7f2e7 / #f2ecdd with navy ink #1b2735.
- **Hairlines** `--hal-hairline` #2a2d33 (light: #cfc7b2) — panels separate by 1px engraved seams, never shadows.
- **Ink ladder**: ivory `--hal-ivory` (legends, titles) → ink `--hal-ink` (body) → dim `--hal-dim` (meta). Never cool gray on the night ground; light theme mirrors.
- **Accent** `--hal-amber` #ffb000 (light: #b37500) — the single night-lighting accent. **Follows the user's configured accent**: the app's accent ramp writes this token, so mission amber is the default, not a law. `--hal-amber-dim` is its 15% wash for selections/glows.
- **Lamps** are semantic only: green `--hal-lamp-green` (synced/ready), red `--hal-lamp-red` (error/destructive), amber (transmit/active). Never decoration.

## Type

IBM Plex Sans (UI) + IBM Plex Mono (catalog rows, figures, paths, timestamps; tabular numerals) — bundled via @fontsource, offline. Legends: 10px uppercase, +0.12em tracking. Catalog-entry titles: 28px Plex Mono uppercase, ivory, on the work ground with 46px air above. Body measure capped by the reading-width setting.

## Controls

Panel keys (`.key`): hairline border, 4px radius, uppercase legends; pressed insets 1px; the keyed state takes the amber wash. Annunciators (`.annun`): mode/status chips with lamps, active = amber lamp + plate backing. Fields (`.field`): recessed plate-2, amber focus border. Focus-visible: 1px amber outline everywhere (keyboard-first bar). Destructive keys isolated in deliberate space.

## Layout

Standard panel stack: instrument rail (44px) top; file rail plate left (min-w 208); work ground center with faint 120px hairline column grid; HAL bay plate right (min-w 288, the ◉ eye instrument at its head); floating engraved status line on the ground bottom. Fluid 1280–1600 via min-width columns.

## Motion

One authored moment: the **instrument-lamp bloom** — the eye breathes once on mount (900ms expo-out), the caret blooms on focus, sync blinks while transmitting. Nothing else animates. `prefers-reduced-motion` honored.

## States

Sync annunciator vocabulary: XMIT (blink) / SYNC (green) / CFCT / OFFL / FAIL. Buffers: WRITING… / BUFFER DIRTY / BUFFER CLEAN. Empty and loading states are composed instrument panels, never blank.

## Provenance

Decision round: `.impeccable/questions/92d13115.answer.json` (world), comp approval `comp-a.json`. Comps: authored SVG (headless-Chrome rasterized), prompts embedded in sidecars. Quality bars: Apollo DSKY photographs (Wikimedia Commons, URLs in the answer payload). The hero/responsive gates closed under the owner's recorded "visual pass + recorded decision" on content-vs-placeholder drift; the detector's one finding (violet on the splash) was fixed.

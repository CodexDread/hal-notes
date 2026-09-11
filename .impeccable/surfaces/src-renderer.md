---
version: 1
slug: "src-renderer"
primary_target: "src/renderer"
related_targets: []
---

# Surface brief — app shell & all modes (primary target: the whole renderer)

## Scope and mode

Scope: full visual redesign of every surface (notes/editor, sidebar panes, graph, research, review, settings, console, empty states). Mode: **Operate** — the visitor completes tasks at a daily-driver console; scanability, consistency, and native expectations outrank expression. Brand lives in precise details.

## Audience, job, constraints

Owner-operated power tool (see PRODUCT.md): capture, learn, retain. Keyboard-first bar. HAL ◉ binding. User-configurable accent must survive (amber is the default, not a law). No-grading rules are product law. Windows + Arch parity.

## Direction contract

THESIS: HAL Notes as Apollo-era mission instrumentation — the vault operated, not decorated. Refuses both the soft-panel dark-dashboard default and its cream-journal opposite: panels are engraved plates divided by hairlines, state is lamps, hierarchy is luminosity, and one amber night-lighting accent carries action.

OWN-WORLD: near-black blued-steel ground #0d0f12, panel plates #171a1f one step up, separated by 1px engraved hairlines (#2a2d33). Ivory engraved legends #e8dcc4 — IBM Plex Sans uppercase, +0.08em tracking, 10-11px. IBM Plex Mono for every figure, path, hash, timestamp (tabular). Default accent mission amber #ffb000 (user-configurable). Semantic lamps — green #5a9e6f (synced/ready), red #e05252 (error) — appear only as annunciator lamps, never decoration. Controls are panel keys: hairline border, 4px radius, pressed = inset 1px + one brightness step down. Light theme = day plate: chart-cream ground #efe9da, navy ink #1b2735, amber holds. Recognizable with all content removed: the plate grid, engraved legends, one amber lamp glowing.

STORY: the user sits at a night-lit console. Mode switching is panel selection (lamp on the active plate). Sync is an annunciator: amber blink while transmitting, steady green when current. HAL is the eye watching the desk. Everything reads as operated equipment — labeled, calm, unambiguous; destructive keys sit isolated with deliberate empty space.

FIRST VIEWPORT: the notes desk. Top rail: one instrument plate with mode annunciators left (engraved legends, lamp on active), sync annunciator + console + settings keys right. Left: file rail plate (engraved header, catalog-density rows). Center: work plate — title field as catalog entry, faint hairline column grid behind prose, editor caret with amber lamp bloom. Right: HAL bay — the ◉ eye instrument at top, chat transcript beneath. Amber appears only on: active selections, caret bloom, primary keys, the eye.

FORM: Apollo Avionics — IMPECCABLE'S PICK card (not the roll); roll seed key 3ace536e. Code-led build (no image generation); ambition lives here in FIRST VIEWPORT plus the named signature interaction: the instrument-lamp bloom (panel legend + caret glow, exponential ease-out, the run's one authored motion).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

# @hal-notes/plugin-sdk

Type definitions, manifest utilities, and dev tooling for HAL Notes plugin developers.

## Quick start

```bash
npx @hal-notes/create-hal-plugin my-plugin
cd my-plugin
```

Then in HAL Notes: **Settings → Plugins → paste the folder path → INSTALL → toggle on**.

## What a plugin is

A folder with two required files:

```
my-plugin/
  manifest.json
  index.js
```

### manifest.json

```json
{
  "id": "com.you.my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "halVersion": "0.12.0",
  "description": "One-line description",
  "entry": "index.js",
  "permissions": ["ui", "notes"]
}
```

**Permissions** gate SDK facets at runtime — without the permission, the facet is `undefined`:

| Permission | Facet | What it gives |
|---|---|---|
| `ui` | `hal.ui` | Register modes (top-level tabs), inject styles, log to the debug console |
| `notes` | `hal.notes` | List, open, create, save, search vault notes |
| `storage` | `hal.storage` | Per-plugin key-value store (survives restarts) |
| `ai` | `hal.ai` | Chat/completions through the user's configured provider |
| `files` | `hal.files` | Native save-text dialog for exports |

## Writing the plugin

Your entry is called with one argument — the SDK object:

```js
function halPluginMain(hal) {
  hal.ui.registerMode({
    id: 'my-plugin',
    label: 'My Plugin',
    order: 100,
    mount(container) {
      container.innerHTML = '<h2>Hello from my plugin</h2>'
      return () => { /* cleanup on unmount */ }
    }
  })
}

if (typeof halPlugin !== 'undefined') {
  halPluginMain(halPlugin)
}
```

The `halPlugin` global is how the app hands your script the SDK. Plain DOM in your mount container — no framework required.

### API reference

See [dist/index.d.ts](dist/index.d.ts) for the complete typed surface, or import the types:

```bash
npm install @hal-notes/plugin-sdk
```

```ts
import type { HalPluginSdk, ModeDefinition } from '@hal-notes/plugin-sdk'
```

### Version compatibility

The `halVersion` field declares your minimum app version; the app refuses to load plugins built for a newer HAL Notes than it is. Use `checkVersion(pluginVersion, appVersion)` from this package for CI checks.

## Example plugin

[`examples/word-count/`](examples/word-count/) — a complete, working reference that registers a mode, reads the vault through the notes facet, and renders a stats dashboard. Install it the same way (Settings → Plugins → folder path → INSTALL).

## Dev workflow

HAL Notes loads plugins from `userData/plugins/<id>/`. For local development:

1. Scaffold with `npx @hal-notes/create-hal-plugin`
2. Install the folder path in Settings → Plugins
3. Edit `index.js` in your editor
4. Toggle the plugin off/on in Settings to reload it (the app re-reads the entry from disk)

## Publishing

Ship the folder (or a zip of it). Users install by path today; a plugin directory/registry is roadmap.

## License

MIT

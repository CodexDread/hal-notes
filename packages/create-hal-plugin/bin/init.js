#!/usr/bin/env node
/**
 * create-hal-plugin — scaffold a new HAL Notes plugin.
 *
 * Usage: npx @hal-notes/create-hal-plugin my-plugin
 *        cd my-plugin && npm run dev
 */
const fs = require('fs')
const path = require('path')

const rawName = process.argv[2]
if (!rawName) {
  console.error('Usage: npx @hal-notes/create-hal-plugin <plugin-name>')
  process.exit(1)
}

const name = rawName.toLowerCase().replace(/[^a-z0-9-]/g, '-')
const id = `com.local.${name.replace(/-/g, '.')}`
const dir = path.resolve(process.cwd(), rawName)

if (fs.existsSync(dir)) {
  console.error(`Directory "${rawName}" already exists`)
  process.exit(1)
}

fs.mkdirSync(dir, { recursive: true })

fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
  id,
  name: rawName,
  version: '0.1.0',
  halVersion: '0.12.0',
  description: 'A HAL Notes plugin',
  entry: 'index.js',
  permissions: ['ui', 'notes']
}, null, 2) + '\n')

fs.writeFileSync(path.join(dir, 'index.js'), `/**
 * ${rawName} — HAL Notes plugin
 * Docs: https://github.com/CodexDread/hal-notes/tree/main/packages/hal-plugin-sdk
 */
module.exports = function halPluginMain(hal) {
  hal.ui.status('${rawName} loaded')

  hal.ui.registerMode({
    id: '${name}',
    label: '${rawName}',
    order: 100,
    mount(container) {
      container.innerHTML = \`
        <div style="font-family: 'IBM Plex Sans', system-ui, sans-serif; padding: 3rem; color: var(--hal-ink);">
          <h2 style="color: var(--hal-ivory); margin-bottom: 0.5rem;">${rawName}</h2>
          <p>Scaffold is working. Build your UI here — plain DOM, your own CSS via hal.ui.addStyle().</p>
          <div id="note-count" style="margin-top: 1rem; color: var(--hal-dim);"></div>
        </div>
      \`

      if (hal.notes) {
        hal.notes.list().then(vault => {
          const el = container.querySelector('#note-count')
          if (el) el.textContent = vault.notes.length + ' notes in the vault'
        })
      }

      return () => {
        // cleanup: remove listeners, restore DOM
      }
    }
  })
}

// Also support being evaluated as a plain script (the app passes the SDK
// as halPlugin): remove this block if you use the module.exports form.
if (typeof halPlugin !== 'undefined') {
  module.exports(halPlugin)
}
`)

fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
  name: id,
  version: '0.1.0',
  private: true,
  scripts: {
    dev: 'echo "Load this plugin in HAL Notes: Settings → Plugins → paste this folder path → INSTALL"'
  }
}, null, 2) + '\n')

fs.writeFileSync(path.join(dir, 'README.md'), `# ${rawName}

A HAL Notes plugin.

## Install for development

1. Open HAL Notes → Settings (CONFIG) → Plugins
2. Paste this folder's absolute path → INSTALL
3. Toggle the plugin on

## Permissions

Declared in \`manifest.json\`. Remove what you don't need:
- \`ui\` — register modes, inject styles
- \`notes\` — read/write vault notes
- \`storage\` — per-plugin key-value storage
- \`ai\` — chat/completions through the user's provider
- \`files\` — save-text export dialog
`)

console.log(`  ✓ ${rawName}/ created`)
console.log(`    manifest.json, index.js, package.json, README.md`)
console.log(``)
console.log(`  Next: open HAL Notes → Settings → Plugins`)
console.log(`  Paste this folder path to install: ${dir}`)

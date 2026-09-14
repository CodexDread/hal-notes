/**
 * Word Count — reference HAL Notes plugin.
 * Demonstrates: mode registration, notes facet, addStyle, DOM rendering.
 */
function halPluginMain(hal) {
  hal.ui.addStyle(`
    .wc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1rem; padding: 2rem; }
    .wc-card { border: 1px solid var(--hal-hairline); background: var(--hal-plate); padding: 1.25rem; }
    .wc-num { font-family: var(--hal-font-mono); font-size: 2.5rem; color: var(--hal-amber); }
    .wc-label { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--hal-dim); margin-top: 0.5rem; }
    .wc-list { padding: 0 2rem 2rem; color: var(--hal-ink); font-size: 13px; }
    .wc-row { display: flex; justify-content: space-between; padding: 0.25rem 0; border-bottom: 1px solid var(--hal-hairline-dim); }
  `)

  hal.ui.registerMode({
    id: 'word-count',
    label: 'Word Count',
    order: 90,
    mount(container) {
      container.innerHTML = `
        <div style="padding: 2rem; color: var(--hal-ivory); font-size: 1.1rem; text-transform: uppercase; letter-spacing: 0.08em;">
          Word Count — vault stats
        </div>
        <div class="wc-grid">
          <div class="wc-card"><div class="wc-num" id="wc-total">…</div><div class="wc-label">Total words</div></div>
          <div class="wc-card"><div class="wc-num" id="wc-notes">…</div><div class="wc-label">Notes</div></div>
          <div class="wc-card"><div class="wc-num" id="wc-avg">…</div><div class="wc-label">Avg per note</div></div>
        </div>
        <div class="wc-list" id="wc-top"></div>
      `

      const unmount = hal.notes.list().then(async (vault) => {
        const counts = []
        let total = 0
        for (const meta of vault.notes.slice(0, 200)) {
          const note = await hal.notes.open(meta.id)
          if (!note) continue
          const words = note.content.trim() ? note.content.trim().split(/\s+/).length : 0
          total += words
          counts.push({ name: meta.name, words })
        }
        counts.sort((a, b) => b.words - a.words)
        const q = (id) => container.querySelector(id)
        if (q('#wc-total')) q('#wc-total').textContent = String(total)
        if (q('#wc-notes')) q('#wc-notes').textContent = String(vault.notes.length)
        if (q('#wc-avg')) q('#wc-avg').textContent = vault.notes.length ? String(Math.round(total / vault.notes.length)) : '0'
        if (q('#wc-top')) {
          q('#wc-top').innerHTML =
            '<div style="color:var(--hal-dim);font-size:10px;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:0.5rem;">Longest notes</div>' +
            counts.slice(0, 10).map((c) => `<div class="wc-row"><span>${c.name}</span><span style="font-family:var(--hal-font-mono);color:var(--hal-amber)">${c.words}</span></div>`).join('')
        }
      })

      return () => void unmount
    }
  })
}

if (typeof halPlugin !== 'undefined') {
  halPluginMain(halPlugin)
} else if (typeof module !== 'undefined') {
  module.exports = halPluginMain
}

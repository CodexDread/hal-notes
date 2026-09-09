import { useEffect, useState } from 'react'
import type { AppSettings, DriveStatus } from '@shared/types'
import { hal } from '@/lib/ipc'
import { useUi } from '@/state/ui'
import { useVault } from '@/state/vault'

type SettingsTab = 'integrations' | 'style' | 'defaults' | 'plugins'

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'integrations', label: 'Integrations' },
  { id: 'style', label: 'Style' },
  { id: 'defaults', label: 'Defaults' },
  { id: 'plugins', label: 'Plugins' }
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-zinc-800 px-5 py-4 last:border-b-0">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">{title}</h2>
      {children}
    </section>
  )
}

function SelectRow({ label, value, options, onChange }: {
  label: string
  value: number | string
  options: { value: number | string; label: string }[]
  onChange: (v: number | string) => void
}) {
  return (
    <label className="mt-3 block text-xs text-zinc-400 first:mt-0">
      {label}
      <select
        className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200 outline-none focus:border-violet-500"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function Segmented<T extends string>({ value, options, onChange }: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-zinc-700 text-xs">
      {options.map((o) => (
        <button
          key={o.value}
          className={`px-3 py-1.5 ${value === o.value ? 'bg-violet-500/20 text-violet-300' : 'text-zinc-400 hover:bg-zinc-800'}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function DriveSection() {
  const [status, setStatus] = useState<DriveStatus | null>(null)
  const [secret, setSecret] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')
  const [authUrl, setAuthUrl] = useState('')
  const [folderName, setFolderName] = useState('')
  const settings = useUi((s) => s.settings)
  const refreshVault = useVault((s) => s.refresh)

  useEffect(() => {
    const off = hal.on('drive:auth-url', (url) => setAuthUrl(url))
    return off
  }, [])

  const reload = (): void => {
    void hal.driveStatus().then(setStatus).catch(() => setStatus(null))
  }
  useEffect(reload, [])

  useEffect(() => {
    if (settings?.vaultFolderName && !folderName) setFolderName(settings.vaultFolderName)
  }, [settings?.vaultFolderName, folderName])

  const configured = status?.configured ?? false
  const connected = status?.connected ?? false

  const doConnect = (): Promise<void> => {
    setError('')
    setAuthUrl('')
    setConnecting(true)
    return hal
      .driveConnect()
      .then(() => reload())
      .then(() => refreshVault())
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setConnecting(false))
  }

  return (
    <Section title="Google Drive">
      {!configured && (
        <div className="mb-3">
          <p className="mb-2 text-xs leading-5 text-zinc-400">
            Create a free OAuth <b>Desktop</b> client at console.cloud.google.com (enable the Drive API), then paste the
            downloaded <code className="text-violet-300">client_secret*.json</code> here. One-time setup.
          </p>
          <textarea
            rows={4}
            className="w-full resize-none rounded-md border border-zinc-700 bg-zinc-900 p-2 font-mono text-[11px] outline-none focus:border-violet-500"
            placeholder='{"installed": {"client_id": …}}'
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
          <button
            className="mt-2 rounded-md bg-violet-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-400 disabled:opacity-40"
            disabled={!secret.trim()}
            onClick={() => {
              try {
                void hal.driveConfigure(secret.trim()).then(() => {
                  setSecret('')
                  reload()
                })
              } catch {
                setError('That does not look like a client secret file')
              }
            }}
          >
            Save client secret
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 text-sm">
        <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400' : configured ? 'bg-amber-400' : 'bg-zinc-600'}`} />
        {connected ? 'Connected — notes sync two-way with Drive' : configured ? 'Configured — not signed in' : 'Not configured'}
      </div>
      {status?.vaultFolderId && (
        <p className="mt-1 text-[11px] text-zinc-600">
          Vault folder: {status.vaultFolderName} ({status.vaultFolderId})
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {configured && !connected && (
          <button
            className="rounded-md bg-violet-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-400 disabled:opacity-50"
            disabled={connecting}
            onClick={() => void doConnect()}
          >
            {connecting ? 'Waiting for sign-in in your browser…' : 'Connect to Google Drive'}
          </button>
        )}
        {connected && (
          <>
            <button
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
              onClick={() => void hal.driveSyncNow()}
            >
              Sync now
            </button>
            <button
              className="rounded-md border border-red-500/40 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
              onClick={() => {
                void hal.driveDisconnect().then(() => {
                  reload()
                  void refreshVault()
                })
              }}
            >
              Disconnect
            </button>
          </>
        )}
      </div>
      {connecting && (
        <p className="mt-2 text-xs leading-5 text-amber-300">
          Waiting for Google sign-in.{' '}
          {authUrl ? (
            <>
              If your browser didn’t open,{' '}
              <a className="text-violet-300 underline" href={authUrl} target="_blank" rel="noopener noreferrer">
                open the sign-in page manually
              </a>
              .
            </>
          ) : (
            'Preparing the sign-in page…'
          )}
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {connected && (
        <label className="mt-3 block text-xs text-zinc-400">
          Vault folder in My Drive
          <input
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200 outline-none focus:border-violet-500"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            onBlur={() => {
              if (folderName.trim() && folderName.trim() !== settings?.vaultFolderName) {
                void hal.settingsSet({ vaultFolderName: folderName.trim() })
              }
            }}
          />
        </label>
      )}
    </Section>
  )
}

function GeminiSection() {
  const settings = useUi((s) => s.settings)
  const applySettings = useUi((s) => s.applySettings)
  const embeddingsReady = useUi((s) => s.embeddingsReady)
  const embedProgress = useUi((s) => s.embedProgress)
  const refreshEmbeddingsReady = useUi((s) => s.refreshEmbeddingsReady)
  const [key, setKey] = useState('')
  const [testMsg, setTestMsg] = useState('')
  const [testing, setTesting] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [building, setBuilding] = useState(false)

  const keySet = settings?.geminiKeySet ?? false
  const chatModel = settings?.chatModel || 'gemini-flash-latest'

  const saveKey = (): void => {
    void hal
      .aiSetKey(key.trim())
      .then(() => hal.settingsGet())
      .then(applySettings)
      .then(() => {
        setKey('')
        setTestMsg('Key saved')
        void hal.aiModels().then(setModels).catch(() => setModels([]))
      })
  }

  return (
    <Section title="Gemini">
      {!keySet ? (
        <div>
          <p className="mb-2 text-xs leading-5 text-zinc-400">
            Get a free API key at <b>aistudio.google.com</b> — your Google AI Pro/Ultra subscription raises its rate
            limits. The key is stored encrypted on this machine only.
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm outline-none focus:border-violet-500"
              placeholder="AIza…"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <button
              className="rounded-md bg-violet-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-400 disabled:opacity-40"
              disabled={!key.trim()}
              onClick={saveKey}
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> API key saved
            <button
              className="ml-auto rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
              disabled={testing}
              onClick={() => {
                setTesting(true)
                setTestMsg('')
                void hal
                  .aiTest()
                  .then(() => setTestMsg('✓ Key works'))
                  .catch((err: unknown) => setTestMsg(`✗ ${err instanceof Error ? err.message : String(err)}`))
                  .finally(() => setTesting(false))
              }}
            >
              {testing ? 'Testing…' : 'Test key'}
            </button>
            <button
              className="rounded-md border border-red-500/40 px-2.5 py-1 text-xs text-red-400 hover:bg-red-500/10"
              onClick={() => {
                void hal.aiClearKey().then(() => hal.settingsGet()).then(applySettings)
              }}
            >
              Remove
            </button>
          </div>
          {testMsg && <p className={`text-xs ${testMsg.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>{testMsg}</p>}

          <label className="block text-xs text-zinc-400">
            Chat model
            <select
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200 outline-none focus:border-violet-500"
              value={chatModel}
              onChange={(e) => void hal.settingsSet({ chatModel: e.target.value }).then(applySettings)}
              onClick={() => {
                if (models.length === 0) void hal.aiModels().then(setModels).catch(() => setModels([]))
              }}
            >
              <option value="gemini-flash-latest">gemini-flash-latest (default)</option>
              {models
                .filter((m) => m !== chatModel)
                .map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              {models.includes(chatModel) && <option value={chatModel}>{chatModel}</option>}
            </select>
          </label>

          <div className="rounded-md bg-zinc-800/50 p-2.5 text-xs text-zinc-400">
            <div className="flex items-center justify-between">
              <span>Semantic index {embeddingsReady ? '✓ ready' : '— not built'}</span>
              <button
                className="rounded bg-violet-500/20 px-2 py-1 text-violet-300 hover:bg-violet-500/30 disabled:opacity-50"
                disabled={building}
                onClick={() => {
                  setBuilding(true)
                  void hal
                    .embeddingsBackfill()
                    .then(() => refreshEmbeddingsReady())
                    .catch((err: unknown) => setTestMsg(err instanceof Error ? err.message : String(err)))
                    .finally(() => setBuilding(false))
                }}
              >
                {building ? 'Building…' : embeddingsReady ? 'Rebuild' : 'Build index'}
              </button>
            </div>
            {embedProgress && (
              <div className="mt-2">
                <div className="h-1 overflow-hidden rounded bg-zinc-700">
                  <div
                    className="h-full bg-violet-400 transition-all"
                    style={{ width: `${embedProgress.total ? (embedProgress.done / embedProgress.total) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-[10px] text-zinc-500">
                  {embedProgress.done}/{embedProgress.total} notes embedded
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </Section>
  )
}

function StyleSection() {
  const settings = useUi((s) => s.settings)

  return (
    <Section title="Appearance">
      <div className="text-xs text-zinc-400">
        Theme
        <div className="mt-1.5">
          <Segmented<'dark' | 'light'>
            value={settings?.theme ?? 'dark'}
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' }
            ]}
            onChange={(theme) => void hal.settingsSet({ theme })}
          />
        </div>
      </div>
      <SelectRow
        label="Editor font size"
        value={settings?.editorFontSize ?? 15}
        options={[
          { value: 14, label: 'Small (14px)' },
          { value: 15, label: 'Normal (15px)' },
          { value: 16, label: 'Large (16px)' },
          { value: 18, label: 'Extra large (18px)' }
        ]}
        onChange={(v) => void hal.settingsSet({ editorFontSize: Number(v) })}
      />
    </Section>
  )
}

function DefaultsSection() {
  const settings = useUi((s) => s.settings)

  return (
    <Section title="Editor">
      <div className="text-xs text-zinc-400">
        Default view
        <div className="mt-1.5">
          <Segmented<'edit' | 'split' | 'preview'>
            value={settings?.defaultViewMode ?? 'split'}
            options={[
              { value: 'edit', label: 'Edit' },
              { value: 'split', label: 'Split' },
              { value: 'preview', label: 'Preview' }
            ]}
            onChange={(defaultViewMode) => void hal.settingsSet({ defaultViewMode })}
          />
        </div>
        <p className="mt-1.5 text-[11px] text-zinc-600">Applied when the app launches.</p>
      </div>
      <SelectRow
        label="HAL suggestion delay (after you stop typing)"
        value={settings?.captureDelayMs ?? 12_000}
        options={[
          { value: 4_000, label: '4 seconds' },
          { value: 8_000, label: '8 seconds' },
          { value: 12_000, label: '12 seconds' },
          { value: 20_000, label: '20 seconds' }
        ]}
        onChange={(v) => void hal.settingsSet({ captureDelayMs: Number(v) })}
      />
      <SelectRow
        label="Poll Google Drive for changes every"
        value={settings?.syncIntervalMs ?? 30_000}
        options={[
          { value: 15_000, label: '15 seconds' },
          { value: 30_000, label: '30 seconds' },
          { value: 60_000, label: '1 minute' },
          { value: 300_000, label: '5 minutes' }
        ]}
        onChange={(v) => void hal.settingsSet({ syncIntervalMs: Number(v) })}
      />
    </Section>
  )
}

function PluginsSection() {
  return (
    <Section title="Plugins">
      <div className="rounded-lg border border-dashed border-zinc-700 p-5 text-center">
        <div className="text-2xl">🧩</div>
        <p className="mt-2 text-sm text-zinc-300">Plugins are coming soon</p>
        <p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-zinc-500">
          Third-party-style extensions — extra export formats, themes, editor tools — are on the roadmap. The tab is
          reserving their seat.
        </p>
      </div>
    </Section>
  )
}

export function SettingsModal() {
  const open = useUi((s) => s.settingsOpen)
  const close = useUi((s) => s.closeSettings)
  const [tab, setTab] = useState<SettingsTab>('integrations')
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60" onClick={close}>
      <div
        className="flex max-h-[82vh] w-[580px] flex-col rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
          <h1 className="text-sm font-semibold text-zinc-100">Settings</h1>
          <button className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300" onClick={close}>
            ✕
          </button>
        </div>
        <div className="flex shrink-0 gap-1 border-b border-zinc-800 px-3 pt-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`rounded-t-md px-3 py-1.5 text-xs font-medium ${
                tab === t.id ? 'bg-zinc-800 text-violet-300' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === 'integrations' && (
            <>
              <DriveSection />
              <GeminiSection />
            </>
          )}
          {tab === 'style' && <StyleSection />}
          {tab === 'defaults' && <DefaultsSection />}
          {tab === 'plugins' && <PluginsSection />}
        </div>
        <div className="shrink-0 border-t border-zinc-800 px-5 py-2 text-right text-[10px] text-zinc-600">
          HAL Notes v0.1
        </div>
      </div>
    </div>
  )
}

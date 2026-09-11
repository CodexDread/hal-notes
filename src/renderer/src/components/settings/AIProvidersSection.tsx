import { useEffect, useState } from 'react'
import { hal } from '@/lib/ipc'
import { useUi } from '@/state/ui'

const PROVIDER_OPTIONS = [
  { id: 'google', label: 'Google (Gemini)' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'custom', label: 'OpenAI-compatible (Ollama…)' }
] as const

interface Status {
  active: string
  activeReady: boolean
  embeddingProvider: string
  chatModel: string
}

export function AIProvidersSection(): React.ReactElement {
  const settings = useUi((s) => s.settings)
  const applySettings = useUi((s) => s.applySettings)
  const refreshEmbeddingsReady = useUi((s) => s.refreshEmbeddingsReady)
  const [status, setStatus] = useState<Status | null>(null)
  const [keyDraft, setKeyDraft] = useState('')
  const [testMsg, setTestMsg] = useState('')
  const [testing, setTesting] = useState(false)
  const [models, setModels] = useState<string[]>([])

  const reloadStatus = (): void => {
    void hal.aiStatus().then(setStatus).catch(() => setStatus(null))
  }
  useEffect(reloadStatus, [])

  const active = status?.active ?? settings?.aiProvider ?? 'google'
  const activeLabel = PROVIDER_OPTIONS.find((p) => p.id === active)?.label ?? active
  const googleKeySet = settings?.geminiKeySet ?? false
  const chatModel = settings?.chatModel || ''

  const loadModels = (): void => {
    void hal.aiModels(active).then(setModels).catch(() => setModels([]))
  }

  const test = (): void => {
    setTesting(true)
    setTestMsg('')
    void hal
      .aiTest(active)
      .then(() => setTestMsg('✓ works'))
      .catch((err: unknown) => setTestMsg(`✗ ${err instanceof Error ? err.message : String(err)}`))
      .finally(() => setTesting(false))
  }

  return (
    <section className="border-b border-[var(--hal-hairline)] px-5 py-4 last:border-b-0">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--hal-dim)]">AI providers</h2>

      <div className="text-xs text-[var(--hal-dim)]">
        Chat provider — Ask HAL, research paths, smart capture, review cards
        <select
          className="mt-1.5 w-full rounded-md border border-[var(--hal-hairline)] bg-[var(--hal-plate)] px-2 py-1.5 text-sm text-[var(--hal-ink)] outline-none focus:border-[var(--hal-amber)]"
          value={active}
          onChange={(e) => {
            setModels([])
            setTestMsg('')
            void hal.aiSetProvider(e.target.value).then(applySettings).then(reloadStatus)
          }}
        >
          {PROVIDER_OPTIONS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {active === 'google' ? (
        <div className="mt-3 text-xs text-[var(--hal-dim)]">
          {googleKeySet ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="h-2 w-2 rounded-full bg-[var(--hal-lamp-green)]" /> Google API key saved (manage below)
            </div>
          ) : (
            <p className="leading-5">
              No Google key yet — the field below accepts one. Free at aistudio.google.com; a Google AI Pro/Ultra
              subscription raises its limits.
            </p>
          )}
        </div>
      ) : active === 'custom' ? (
        <div className="mt-3 space-y-2 text-xs text-[var(--hal-dim)]">
          <label className="block">
            Base URL (Ollama, LM Studio, vLLM…)
            <input
              className="mt-1 w-full rounded-md border border-[var(--hal-hairline)] bg-[var(--hal-plate)] px-2 py-1.5 text-sm text-[var(--hal-ink)] outline-none focus:border-[var(--hal-amber)]"
              placeholder="http://localhost:11434/v1"
              onBlur={(e) => void hal.aiSetCustomBaseUrl(e.target.value.trim())}
            />
          </label>
          <KeyRow
            provider={active}
            placeholder="API key (optional for local servers)"
            draft={keyDraft}
            setDraft={setKeyDraft}
            onSaved={() => {
              setTestMsg('Key saved')
              reloadStatus()
            }}
          />
        </div>
      ) : (
        <div className="mt-3 text-xs text-[var(--hal-dim)]">
          <KeyRow
            provider={active}
            placeholder={`${activeLabel} API key`}
            draft={keyDraft}
            setDraft={setKeyDraft}
            onSaved={() => {
              setTestMsg('Key saved')
              reloadStatus()
            }}
          />
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          className="rounded-md border border-[var(--hal-hairline)] px-3 py-1.5 text-xs text-[var(--hal-ink)] hover:bg-[var(--hal-plate-2)] disabled:opacity-40"
          disabled={testing}
          onClick={test}
        >
          {testing ? 'Testing…' : `Test ${activeLabel}`}
        </button>
        <span className={`text-xs ${status?.activeReady ? 'text-[var(--hal-lamp-green)]' : 'text-[var(--hal-amber)]'}`}>
          {status?.activeReady ? 'ready' : 'not configured'}
        </span>
        {testMsg && (
          <span className={`text-xs ${testMsg.startsWith('✓') ? 'text-[var(--hal-lamp-green)]' : 'text-[var(--hal-lamp-red)]'}`}>{testMsg}</span>
        )}
      </div>

      <label className="mt-3 block text-xs text-[var(--hal-dim)]">
        Chat model
        <select
          className="mt-1 w-full rounded-md border border-[var(--hal-hairline)] bg-[var(--hal-plate)] px-2 py-1.5 text-sm text-[var(--hal-ink)] outline-none focus:border-[var(--hal-amber)]"
          value={chatModel}
          onClick={loadModels}
          onChange={(e) => void hal.settingsSet({ chatModel: e.target.value }).then(applySettings)}
        >
          <option value="">(provider default)</option>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
          {chatModel && !models.includes(chatModel) && <option value={chatModel}>{chatModel}</option>}
        </select>
      </label>

      <label className="mt-3 block text-xs text-[var(--hal-dim)]">
        Embeddings provider (semantic search)
        <select
          className="mt-1 w-full rounded-md border border-[var(--hal-hairline)] bg-[var(--hal-plate)] px-2 py-1.5 text-sm text-[var(--hal-ink)] outline-none focus:border-[var(--hal-amber)]"
          value={settings?.embeddingProvider ?? 'google'}
          onChange={(e) => {
            void hal
              .settingsSet({ embeddingProvider: e.target.value as 'google' | 'openai' | 'custom', embeddingModel: '' })
              .then(applySettings)
              .then(() => refreshEmbeddingsReady())
          }}
        >
          <option value="google">Google (Gemini)</option>
          <option value="openai">OpenAI</option>
          <option value="custom">OpenAI-compatible (Ollama…)</option>
        </select>
      </label>
      <p className="mt-1.5 text-[11px] leading-4 text-[var(--hal-dim)] opacity-80">
        Changing the embeddings provider or model clears the semantic index — rebuild it from Search → Semantic →
        Build index. Web-grounded research rounds always use Google's search tool regardless of chat provider.
      </p>
    </section>
  )
}

function KeyRow({
  provider,
  placeholder,
  draft,
  setDraft,
  onSaved
}: {
  provider: string
  placeholder: string
  draft: string
  setDraft: (v: string) => void
  onSaved: () => void
}): React.ReactElement {
  return (
    <div className="flex gap-2">
      <input
        type="password"
        className="min-w-0 flex-1 rounded-md border border-[var(--hal-hairline)] bg-[var(--hal-plate)] px-2 py-1.5 text-sm outline-none focus:border-[var(--hal-amber)]"
        placeholder={placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      <button
        className="rounded-md bg-[var(--hal-amber)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-80 disabled:opacity-40"
        disabled={!draft.trim()}
        onClick={() => {
          void hal.aiSetProviderKey(provider, draft.trim()).then(() => {
            setDraft('')
            onSaved()
          })
        }}
      >
        Save
      </button>
    </div>
  )
}

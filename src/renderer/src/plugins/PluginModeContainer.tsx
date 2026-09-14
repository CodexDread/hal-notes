import { useEffect, useRef } from 'react'
import { mountModeInto } from './host'

/** The host-owned DOM container a plugin mode mounts its UI into. */
export function PluginModeContainer({ modeId }: { modeId: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const cleanup = mountModeInto(modeId, el)
    return () => {
      try {
        cleanup?.()
      } catch {
        // plugin cleanup errors are non-fatal
      }
    }
  }, [modeId])

  return <div ref={ref} className="h-full min-h-0 flex-1" style={{ background: 'var(--hal-ground)' }} />
}

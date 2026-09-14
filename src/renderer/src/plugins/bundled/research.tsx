import { createRoot } from 'react-dom/client'
import { ResearchMode } from '@/components/research/ResearchMode'
import type { HalPluginSdk } from '../host'

/** Research as a bundled plugin: the existing React tree, mounted through the plugin mode system. */
export function registerResearchPlugin(sdk: HalPluginSdk): void {
  sdk.ui.registerMode({
    id: 'research',
    label: 'Research',
    order: 10,
    mount: (container) => {
      const root = createRoot(container)
      root.render(<ResearchMode />)
      return () => root.unmount()
    }
  })
}

import { createRoot } from 'react-dom/client'
import { ReviewMode } from '@/components/review/ReviewMode'
import type { HalPluginSdk } from '../host'

/** Review as a bundled plugin: the existing React tree, mounted through the plugin mode system. */
export function registerReviewPlugin(sdk: HalPluginSdk): void {
  sdk.ui.registerMode({
    id: 'review',
    label: 'Review',
    order: 20,
    mount: (container) => {
      const root = createRoot(container)
      root.render(<ReviewMode />)
      return () => root.unmount()
    }
  })
}

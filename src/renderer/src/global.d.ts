/// <reference types="vite/client" />

import type { HalApi } from '@shared/api'

declare global {
  interface Window {
    hal: HalApi
  }
}

export {}

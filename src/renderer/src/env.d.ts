import type { ViewerApi } from '../../shared/types'

declare global {
  interface Window {
    api: ViewerApi
  }
}

declare module '*.css'

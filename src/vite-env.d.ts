/// <reference types="vite/client" />

declare module '@fontsource/vt323'
declare module '@hackernoon/pixel-icon-library/fonts/iconfont.css'

interface ImportMetaEnv {
  readonly VITE_UMAMI_WEBSITE_ID?: string
  readonly VITE_UMAMI_SCRIPT_URL?: string
}

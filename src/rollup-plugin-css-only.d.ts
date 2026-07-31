declare module 'rollup-plugin-css-only' {
  import type { Plugin } from 'rollup'

  interface Options {
    readonly fileName?: string
  }

  const css: (options?: Options) => Plugin

  export default css
}

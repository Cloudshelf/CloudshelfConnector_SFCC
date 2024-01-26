import { fileURLToPath } from 'node:url'

const { pages } = await import(`./pages.mjs?id=${Math.random()}`)

/**
 * @type {import("@magidoc/cli").MagidocConfiguration}
 */
const config = {
  introspection: {
    type: 'none',
  },
  website: {
    template: 'carbon-multi-page',
    output: fileURLToPath(new URL('./build', import.meta.url)),
    staticAssets: fileURLToPath(new URL('./assets', import.meta.url)),
    options: {
      pages: pages
    },
  },
}

export default config

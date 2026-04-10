import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import viteTsConfigPaths from 'vite-tsconfig-paths'

import { tanstackStart } from '@tanstack/solid-start/plugin/vite'

import solidPlugin from 'vite-plugin-solid'

export default defineConfig({
  plugins: [
    devtools(),
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tanstackStart(),
    solidPlugin({ ssr: true }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) {
            return 'three-vendor'
          }

          if (id.includes('node_modules/@chenglou/pretext')) {
            return 'pretext-vendor'
          }
        },
      },
    },
  },
})

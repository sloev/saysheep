import { defineConfig } from 'vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'))

export default defineConfig(({ mode }) => ({
  root: 'src',
  base: process.env.VITE_BASE !== undefined ? process.env.VITE_BASE : '/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    nodePolyfills(),
    {
      name: 'copy-404',
      closeBundle() {
        const distDir = path.resolve(__dirname, 'dist')
        const indexHtml = path.join(distDir, 'index.html')
        const notFoundHtml = path.join(distDir, '404.html')
        if (fs.existsSync(indexHtml)) {
          fs.copyFileSync(indexHtml, notFoundHtml)
          console.log('Copied index.html to 404.html for SPA routing support')
        }
      }
    }
  ],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    // External (not inline) source maps: still emitted as separate .js.map files
    // for Replay/devtools, but no longer embedded in the served bundle — that
    // inline map was ~2.8MB of the old ~4.3MB entry chunk.
    sourcemap: true,
    rollupOptions: {
      output: {
        // Split heavy vendor libs into their own cacheable chunks so the app
        // isn't one monolithic eagerly-parsed blob.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('leaflet')) return 'leaflet'
          if (id.includes('nostr-tools')) return 'nostr'
          if (id.includes('@noble') || id.includes('@scure')) return 'crypto'
          return 'vendor'
        },
      },
    },
  },
  server: {
    port: 5173,
  },
}))


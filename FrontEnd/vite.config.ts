import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Generates public/genie/manifest.json from the contents of public/genie/.
// Lets the runtime preloader pick up new .webp files automatically — drop a
// file in, the version hash changes, the old Cache Storage bucket is evicted.
function genieManifestPlugin(): Plugin {
  const dir = path.resolve(__dirname, 'public/genie')
  const out = path.resolve(dir, 'manifest.json')

  const write = () => {
    if (!fs.existsSync(dir)) return
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith('.webp'))
      .sort()
    const fingerprint = files
      .map((f) => `${f}:${fs.statSync(path.join(dir, f)).mtimeMs}`)
      .join('|')
    const version = crypto
      .createHash('sha1')
      .update(fingerprint)
      .digest('hex')
      .slice(0, 10)
    fs.writeFileSync(out, JSON.stringify({ version, files }, null, 2))
  }

  return {
    name: 'genie-manifest',
    buildStart() {
      write()
    },
    configureServer(server) {
      write()
      const isWebp = (p: string) =>
        p.startsWith(dir) && p.toLowerCase().endsWith('.webp')
      server.watcher.add(dir)
      server.watcher.on('add', (p) => {
        if (isWebp(p)) write()
      })
      server.watcher.on('unlink', (p) => {
        if (isWebp(p)) write()
      })
      server.watcher.on('change', (p) => {
        if (isWebp(p)) write()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    genieManifestPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      devOptions: {
        enabled: true,
      },
      // Precache the app shell only — code, styles, markup, favicon. Content
      // images (public/genie/**, marketing png/webp) are deliberately excluded:
      // genie/** already has its own Cache Storage preloader (GeniePreloaderContext)
      // and is 100+ MB, and the rest are lazily-loaded page assets, not shell.
      // Never add runtimeCaching for /api/ — this app surfaces live device/embryo
      // data (temperatures, critical alerts) and a cached response could show
      // stale lab data as current.
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,svg}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      manifest: {
        name: 'mG Scale',
        short_name: 'mG Scale',
        description: 'IVF lab management platform for cryogenic tank, incubator, and embryo tracking.',
        theme_color: '#6b1176',
        background_color: '#FDFAFF',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    testTimeout: 15000, // Increase timeout for async tests
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/dist/**',
        '**/coverage/**'
      ]
    }
  }
})

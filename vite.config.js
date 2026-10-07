import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'

const releases = JSON.parse(readFileSync(new URL('./src/admin/releases.json', import.meta.url), 'utf8'))
const digest = createHash('sha256')
for (const name of readdirSync(new URL('./src/', import.meta.url), { recursive: true }).sort()) {
  if (/\.(jsx?|json|css)$/.test(name)) digest.update(name).update(readFileSync(new URL(`./src/${name}`, import.meta.url)))
}
digest.update(readFileSync(new URL('./scripts/admin-worker.template.js', import.meta.url)))
const buildId = digest.digest('hex').slice(0, 20)

const deployment = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'))
const securityHeaders = Object.fromEntries(deployment.headers.find(({ source }) => source === '/(.*)').headers.map(({ key, value }) => [key, value]))

export default defineConfig({
  define: { __DUUK_BUILD_ID__: JSON.stringify(buildId) },
  preview: { headers: securityHeaders },
  plugins: [react(), {
    name: 'duuk-indexing',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'admin-build.json', source: JSON.stringify({ ...releases[0], build_id: buildId, releases }) })
    },
    transformIndexHtml() {
      return process.env.VERCEL_ENV === 'production' ? [] : [
        { tag: 'meta', attrs: { name: 'robots', content: 'noindex, nofollow' }, injectTo: 'head' },
      ]
    },
  }],
})

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'

const releases = JSON.parse(readFileSync(new URL('./src/admin/releases.json', import.meta.url), 'utf8'))
const digest = createHash('sha256')
for (const name of readdirSync(new URL('./src/', import.meta.url), { recursive: true }).sort()) {
  if (/\.(jsx?|mjs|json|css)$/.test(name)) digest.update(name).update(readFileSync(new URL(`./src/${name}`, import.meta.url)))
}
for (const name of ['scripts/admin-worker.template.js', 'scripts/build-admin-worker.mjs', 'scripts/admin-security.mjs', 'vercel.json']) {
  const content = readFileSync(new URL(`./${name}`, import.meta.url))
  // Vercel compacts this configuration before building. Hash its canonical
  // content so the same release has the same identifier locally and remotely.
  digest.update(name).update(name === 'vercel.json' ? `${JSON.stringify(JSON.parse(content.toString('utf8')))}\n` : content)
}
const buildId = digest.digest('hex').slice(0, 20)

const deployment = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'))
const securityHeaders = Object.fromEntries(deployment.headers.find(({ source }) => source === '/(.*)').headers.map(({ key, value }) => [key, value]))

export default defineConfig({
  define: { __DUUK_BUILD_ID__: JSON.stringify(buildId), __DUUK_RELEASE__: JSON.stringify(releases[0]) },
  preview: { headers: securityHeaders },
  plugins: [react(), {
    name: 'duuk-indexing',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'admin-build.json', source: JSON.stringify({ ...releases[0], build_id: buildId }) })
    },
    transformIndexHtml() {
      return process.env.VERCEL_ENV === 'production' ? [] : [
        { tag: 'meta', attrs: { name: 'robots', content: 'noindex, nofollow' }, injectTo: 'head' },
      ]
    },
  }],
})

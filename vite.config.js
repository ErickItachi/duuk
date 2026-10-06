import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'

const deployment = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'))
const securityHeaders = Object.fromEntries(deployment.headers.find(({ source }) => source === '/(.*)').headers.map(({ key, value }) => [key, value]))

export default defineConfig({
  preview: { headers: securityHeaders },
  plugins: [react(), {
    name: 'duuk-indexing',
    transformIndexHtml() {
      return process.env.VERCEL_ENV === 'production' ? [] : [
        { tag: 'meta', attrs: { name: 'robots', content: 'noindex, nofollow' }, injectTo: 'head' },
      ]
    },
  }],
})

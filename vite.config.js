import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), {
    name: 'duuk-admin-preview',
    transformIndexHtml() {
      return process.env.VERCEL_ENV === 'production' ? [] : [
        { tag: 'meta', attrs: { name: 'robots', content: 'noindex, nofollow' }, injectTo: 'head' },
      ]
    },
  }],
  define: {
    'import.meta.env.VITE_ADMIN_PREVIEW': JSON.stringify(process.env.VERCEL_ENV !== 'production'),
  },
})

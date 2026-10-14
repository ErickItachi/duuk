// Visual and layout sweep of the DUUK Admin with the isolated Supabase double.
// Usage: node tests/e2e/screens.mjs --out <dir> [--routes /admin,/admin/agenda] [--widths 390,820,1440] [--themes dark,light] [--full]
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'vite'
import { chromium } from 'playwright-core'
import { installSupabaseMock } from './supabase-mock.mjs'
import * as fixtures from './fixtures.mjs'
import releases from '../../src/admin/releases.json' with { type: 'json' }

export const ADMIN_ROUTES = ['/admin', '/admin/agenda', '/admin/ai', '/admin/comercial', '/admin/comercial/clientes', '/admin/comercial/pipeline', '/admin/comercial/contatos', '/admin/comercial/follow-ups', '/admin/comercial/emails', '/admin/comercial/modelos', '/admin/comercial/relatorios', '/admin/contratos', '/admin/financeiro', '/admin/financeiro?aba=extrato', '/admin/financeiro?aba=contas', '/admin/despesas', '/admin/social', '/admin/social/publicar', '/admin/social/calendario', '/admin/social/biblioteca', '/admin/social/insights', '/admin/social/conexao', '/admin/insights', '/admin/drive', '/admin/portfolio', '/admin/inicio', '/admin/midias', '/admin/notificacoes', '/admin/configuracoes/usuarios', '/admin/configuracoes/grupos', '/admin/configuracoes/permissoes', '/admin/configuracoes/notificacoes', '/admin/configuracoes/integracoes', '/admin/configuracoes/historico', '/admin/configuracoes/sobre', '/admin/configuracoes/perfil']

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index > 0 ? process.argv[index + 1] : fallback
}

export async function startServer() {
  // DUUK_VITE_CACHE gives parallel runs their own dependency cache.
  const server = await createServer({ root: new URL('../../', import.meta.url).pathname, logLevel: 'error', cacheDir: process.env.DUUK_VITE_CACHE || undefined, server: { port: 0, host: '127.0.0.1' } })
  await server.listen()
  const address = server.httpServer.address()
  return { server, origin: `http://127.0.0.1:${address.port}` }
}

export async function openAdmin(browser, origin, { route = '/admin', width = 1440, height = 900, theme = 'dark', signedIn = true, reducedMotion = 'reduce', permissions = fixtures.permissions, profile = fixtures.profile, localStorage, tables = fixtures.tables(), rpc = fixtures.rpc, functions = fixtures.functions } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion, colorScheme: theme === 'light' ? 'light' : 'dark', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', hasTouch: width < 1024, isMobile: width < 768 })
  const page = await context.newPage()
  const errors = [], unknown = []
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`))
  page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource|ERR_|WebSocket/.test(message.text())) errors.push(`console: ${message.text()}`) })
  await page.clock.setFixedTime(new Date(`${fixtures.TODAY}T10:00:00-03:00`))
  const mock = await installSupabaseMock(page, { user: fixtures.user, profile, permissions, tables, rpc, functions, theme: theme === 'system' ? undefined : theme, signedIn, localStorage: { [`duuk-release-seen:${fixtures.user.id}:${releases[0].version}`]: '1', ...(theme === 'system' ? { [`duuk-admin-theme:${fixtures.user.id}`]: 'system' } : {}), ...localStorage }, log: entry => unknown.push(entry) })
  await page.goto(origin + route, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.admin-shell, .admin-login', { timeout: 20000 }).catch(() => errors.push('timeout: shell not rendered'))
  await page.waitForSelector('.duuk-loader, .admin-loader', { state: 'detached', timeout: 15000 }).catch(() => errors.push('timeout: loader still visible'))
  await settle(page)
  return { context, page, errors, unknown, mock }
}

export async function settle(page, quiet = 500, limit = 8000) {
  let last = Date.now()
  const bump = () => { last = Date.now() }
  page.on('request', bump); page.on('requestfinished', bump)
  const started = Date.now()
  while (Date.now() - last < quiet && Date.now() - started < limit) await page.waitForTimeout(100)
  while (Date.now() - last < quiet && Date.now() - started < limit) await page.waitForTimeout(100)
  await page.waitForTimeout(150)
  page.off('request', bump); page.off('requestfinished', bump)
}

export async function layoutIssues(page) {
  return page.evaluate(() => {
    const issues = []
    const width = document.documentElement.clientWidth
    // Content inside a horizontal scroller (kanban, tabs, wide tables) is reachable by scrolling it.
    const scrolls = element => { for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) { const overflow = getComputedStyle(node).overflowX; if ((overflow === 'auto' || overflow === 'scroll') && node.scrollWidth > node.clientWidth) return true } return false }
    if (document.documentElement.scrollWidth > width + 1) issues.push(`horizontal overflow: ${document.documentElement.scrollWidth} > ${width}`)
    for (const element of document.querySelectorAll('.admin-shell *')) {
      const box = element.getBoundingClientRect()
      if (!box.width || !box.height) continue
      const style = getComputedStyle(element)
      if (style.position === 'fixed' || element.closest('[aria-hidden="true"],[inert],dialog:not([open])')) continue
      if (box.right > width + 2 && !element.closest('[data-scroll-x], .admin-table-scroll') && !scrolls(element)) { issues.push(`offscreen: ${element.tagName.toLowerCase()}.${String(element.className).split(' ')[0]} right=${Math.round(box.right)}`); if (issues.length > 6) break }
    }
    return issues
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = option('out', 'test-results/screens')
  const routes = (option('routes', '') || ADMIN_ROUTES.join(',')).split(',').filter(Boolean)
  const widths = option('widths', '390,1440').split(',').map(Number)
  const themes = option('themes', 'dark,light').split(',')
  const full = process.argv.includes('--full')
  await mkdir(out, { recursive: true })
  const { server, origin } = await startServer()
  const browser = await chromium.launch()
  const report = []
  try {
    for (const route of routes) for (const theme of themes) for (const width of widths) {
      const name = `${route.replace(/^\/admin\/?/, 'admin-').replace(/[^a-z0-9-]+/gi, '-').replace(/-+$/, '') || 'admin'}-${theme}-${width}`
      const { context, page, errors, unknown } = await openAdmin(browser, origin, { route, width, theme, height: width < 768 ? 844 : 900 })
      const issues = await layoutIssues(page)
      await page.screenshot({ path: `${out}/${name}.png`, fullPage: full })
      report.push({ name, route, theme, width, errors, issues, unknown: [...new Set(unknown)] })
      console.log(`${name}${errors.length ? ` errors=${errors.length}` : ''}${issues.length ? ` issues=${issues.length}` : ''}${unknown.length ? ` unknown=${[...new Set(unknown)].join('|')}` : ''}`)
      await context.close()
    }
  } finally {
    await browser.close(); await server.close()
    await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2))
  }
  const failing = report.filter(item => item.errors.length || item.issues.length)
  if (failing.length) { console.log(`\n${failing.length} screen(s) with errors or layout issues`); for (const item of failing.slice(0, 20)) console.log(item.name, [...item.errors, ...item.issues].slice(0, 3)) }
}

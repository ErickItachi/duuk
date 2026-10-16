// Auth is entirely intercepted: no real users, secrets, notifications or writes.
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'
import { preview } from 'vite'
import { adminShellHeaders } from '../../scripts/admin-security.mjs'
import { installSupabaseMock, fakeSession, SUPABASE_URL } from './supabase-mock.mjs'
import { layoutIssues, settle } from './screens.mjs'
import * as fixtures from './fixtures.mjs'

const config = JSON.parse(await readFile(new URL('../../vercel.json', import.meta.url), 'utf8'))
const securityHeaders = adminShellHeaders(config)
delete securityHeaders['content-type'] // Vite must retain the MIME of each JS/CSS asset.
const server = await preview({ root: new URL('../../', import.meta.url).pathname, preview: { host: '127.0.0.1', port: 0, headers: securityHeaders } })
const origin = `http://127.0.0.1:${server.httpServer.address().port}`
const browser = await chromium.launch({ channel: 'chrome' })
const output = '/tmp/duuk-security-e2e'
await mkdir(output, { recursive: true })
const factor = { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', factor_type: 'totp', status: 'verified', friendly_name: 'Autenticador de teste' }
const json = (body, status = 200) => ({ status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })
function passwordSession(user) {
  const session = fakeSession(user)
  const parts = session.access_token.split('.')
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url'))
  claims.aal = 'aal1'; claims.amr = [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }]
  parts[1] = Buffer.from(JSON.stringify(claims)).toString('base64url')
  return { ...session, access_token: parts.join('.') }
}

try {
  for (const width of [320, 1440]) for (const step of ['enroll', 'challenge']) for (const entry of ['resume', 'password', 'server-challenge']) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' })
    const page = await context.newPage(), errors = []
    page.on('pageerror', error => { errors.push(error.message); console.log('pageerror:', error.message) })
    await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', event => window.__csp.push(event.violatedDirective)) })
    let user = { ...fixtures.user, factors: step === 'enroll' ? [] : [factor] }, upgraded = false, enrollmentCalls = 0
    const mock = await installSupabaseMock(page, { user, profile: fixtures.profile, permissions: fixtures.permissions, tables: fixtures.tables(), rpc: fixtures.rpc, functions: fixtures.functions, signedIn: entry !== 'password' })
    if (entry !== 'password') await page.addInitScript(session => localStorage.setItem('duuk-admin-auth', JSON.stringify(session)), entry === 'server-challenge' ? fakeSession(user) : passwordSession(user))
    await page.route(`${SUPABASE_URL}/auth/v1/**`, async route => {
      const url = new URL(route.request().url()), path = url.pathname
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } })
      if (path === '/auth/v1/token') return route.fulfill(json(upgraded ? fakeSession(user) : passwordSession(user)))
      if (path === '/auth/v1/user') return route.fulfill(json(user))
      if (path === '/auth/v1/factors' && route.request().method() === 'POST') {
        enrollmentCalls++
        return route.fulfill(json({ id: factor.id, type: 'totp', totp: { qr_code: '<svg xmlns="http://www.w3.org/2000/svg" width="224" height="224"><rect width="224" height="224" fill="#fff"/><rect x="20" y="20" width="40" height="40" fill="#000"/></svg>', secret: 'FICTIONALTESTKEY', uri: 'otpauth://totp/fictional' } }))
      }
      if (path.endsWith('/challenge')) return route.fulfill(json({ id: 'isolated-challenge', type: 'totp', expires_at: Math.floor(Date.now() / 1000) + 120 }))
      if (path.endsWith('/verify')) {
        if (route.request().postDataJSON().code !== '123456') return route.fulfill(json({ msg: 'Invalid code', code: 'mfa_verification_failed' }, 422))
        upgraded = true; user = { ...user, factors: [factor] }
        return route.fulfill(json(fakeSession(user)))
      }
      if (path === '/auth/v1/logout') return route.fulfill({ status: 204 })
      return mock.handle(route)
    })
    let contextRejected = 0
    await page.route(`${SUPABASE_URL}/functions/v1/duuk-team`, async route => {
      if (entry === 'server-challenge' && !upgraded) { contextRejected++; return route.fulfill(json({ error: 'Confirme os dois fatores para acessar o painel.' }, 403)) }
      return route.fallback()
    })
    await page.goto(origin + '/admin/financeiro', { waitUntil: 'domcontentloaded' })
    if (entry === 'password') {
      await page.getByLabel('E-mail', { exact: true }).fill('isolated@test.invalid')
      await page.getByLabel('Senha', { exact: true }).fill('ISOLATED-TEST-PASSWORD')
      await page.getByRole('button', { name: 'Entrar', exact: true }).click()
    }
    await page.waitForSelector('.admin-mfa', { timeout: 15000 }).catch(async error => { console.log('Gate diagnostic:', await page.locator('body').innerText(), await page.evaluate(() => window.__csp)); throw error })
    await settle(page)
    assert.equal(await page.locator('.admin-shell').count(), 0)
    assert.equal(mock.calls.filter(call => call.path.startsWith('/functions/v1/') && call.path !== '/functions/v1/duuk-metrics').length, 0, 'Private backend was queried before MFA')
    assert.equal(contextRejected, entry === 'server-challenge' && step === 'challenge' ? 1 : 0)
    assert.equal(enrollmentCalls, 0, 'Enrollment must be explicit')
    if (step === 'enroll') {
      await page.getByRole('button', { name: 'Configurar autenticador', exact: true }).click()
      await page.waitForSelector('.admin-mfa__qr')
      assert(await page.locator('.admin-mfa__qr').evaluate(img => img.complete && img.naturalWidth > 0), 'QR image broken')
      assert.equal(enrollmentCalls, 1)
      const persisted = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))
      assert(!persisted.includes('FICTIONALTESTKEY'))
    }
    const input = page.getByLabel('Código de seis dígitos')
    await input.fill('111111')
    await page.getByRole('button', { name: step === 'enroll' ? 'Ativar e continuar' : 'Confirmar código', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: 'Código inválido' }).waitFor()
    assert.equal(await page.locator('.admin-shell').count(), 0)
    assert.equal(upgraded, false)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: `${output}/${entry}-${step}-${width}.png`, fullPage: true })
    await input.fill('123456')
    await page.getByRole('button', { name: step === 'enroll' ? 'Ativar e continuar' : 'Confirmar código', exact: true }).click()
    await page.waitForSelector('.admin-shell')
    assert.equal(upgraded, true)
    await settle(page)
    assert.deepEqual(await layoutIssues(page), [])
    assert.deepEqual(errors, [])
    assert.deepEqual(await page.evaluate(() => window.__csp), [])
    await page.evaluate(async () => { try { await fetch('https://outside.invalid/data') } catch {} })
    await page.waitForFunction(() => window.__csp.includes('connect-src'))
    console.log(`MFA ${entry} ${step} ${width}: gate, invalid code, valid code, no private prefetch, QR privacy and CSP passed`)
    await context.close()
  }
  for (const width of [320, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' }), page = await context.newPage()
    const mock = await installSupabaseMock(page, { user: fixtures.user, profile: fixtures.profile, permissions: fixtures.permissions, tables: fixtures.tables(), rpc: fixtures.rpc, functions: fixtures.functions })
    await page.goto(origin + '/admin/configuracoes/seguranca')
    await page.waitForSelector('.admin-security__factors li')
    assert(await page.getByRole('button', { name: 'Remover', exact: true }).isDisabled(), 'Last authenticator can be removed')
    await page.getByRole('button', { name: 'Encerrar outras sessões', exact: true }).click()
    await page.getByRole('button', { name: 'Encerrar sessões', exact: true }).click()
    await page.getByText('As outras sessões foram encerradas.', { exact: false }).waitFor()
    assert(mock.calls.some(call => call.path === '/auth/v1/logout' && call.search === '?scope=others'))
    assert.equal(await page.locator('.admin-shell').count(), 1)
    assert.deepEqual(await layoutIssues(page), [])
    console.log(`Security settings ${width}: reserve factor guard and scoped session revocation passed`)
    await context.close()
  }
  for (const path of ['/ADMIN', '/ad%6din', '/%61dmin', '/Admin/']) {
    const context = await browser.newContext({ serviceWorkers: 'block' }), page = await context.newPage(), privateCalls = []
    await installSupabaseMock(page, { user: fixtures.user, profile: fixtures.profile, permissions: fixtures.permissions, tables: fixtures.tables(), rpc: fixtures.rpc, functions: fixtures.functions })
    await page.route(`${SUPABASE_URL}/functions/v1/**`, route => { privateCalls.push(new URL(page.url()).pathname); return route.fallback() })
    await page.goto(origin + path, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.admin-shell')
    assert(['/admin', '/admin/'].includes(new URL(page.url()).pathname))
    assert(privateCalls.length > 0 && privateCalls.every(path => ['/admin', '/admin/'].includes(path)))
    console.log(`Canonical private entry ${path}: redirected before private requests`)
    await context.close()
  }
} finally { await browser.close(); await new Promise(resolve => server.httpServer.close(resolve)) }

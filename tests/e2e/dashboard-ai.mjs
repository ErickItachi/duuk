// Isolated regression: real-source summary states, mobile overlays, keyboard focus and AI drafts.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'
import { startServer, openAdmin, layoutIssues, settle } from './screens.mjs'
import * as fixtures from './fixtures.mjs'

const out = process.env.DUUK_E2E_OUT || '/tmp/duuk-dashboard-ai'
await mkdir(out, { recursive: true })
const { server, origin } = await startServer()
const browser = await chromium.launch(process.env.DUUK_BROWSER_PATH ? { executablePath: process.env.DUUK_BROWSER_PATH } : { channel: 'chrome' })
const report = []
try {
  for (const width of [320, 390, 768, 1440]) for (const theme of ['dark', 'light']) {
    const { context, page, errors } = await openAdmin(browser, origin, { width, theme, height: width < 768 ? 844 : 1000 })
    const label = `${theme}-${width}`
    assert.equal(await page.locator('.studio-pulse__card').count(), 3)
    assert.equal(await page.locator('.dashboard-hero__photo').evaluate(img => img.complete && img.naturalWidth > 0), true)
    assert.equal(await page.locator('.studio-pulse__ring').count(), 1)
    assert.match(await page.locator('.studio-pulse__bars').getAttribute('aria-label'), /sete dias/)
    assert.deepEqual(await layoutIssues(page), [])
    await page.screenshot({ path: `${out}/home-${label}.png`, fullPage: width === 1440 })

    // A real module dialog, without a real write: launcher disappears and comes back on close.
    await page.getByRole('link', { name: 'Novo compromisso', exact: true }).click()
    await page.waitForSelector('dialog[open]')
    assert.equal(await page.locator('.duuk-ai-help').evaluate(el => getComputedStyle(el).visibility), 'hidden')
    await page.keyboard.press('Escape')
    await page.waitForSelector('dialog[open]', { state: 'detached' })
    assert.equal(await page.locator('.duuk-ai-help').isVisible(), true)

    await page.locator('.duuk-ai-help').click()
    await page.waitForSelector('.duuk-ai-floating-dialog[open] .duuk-ai-welcome')
    await settle(page)
    const dialog = page.locator('.duuk-ai-floating-dialog')
    const rect = await dialog.boundingBox(), viewport = page.viewportSize()
    assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width + 1 && rect.y + rect.height <= viewport.height + 1, `${label}: dialog inside viewport`)
    if (width >= 768) {
      assert.equal(rect.y, 0, `${label}: fixed to the top`)
      assert.equal(rect.x + rect.width, width, `${label}: fixed to the right`)
      assert.equal(Math.round(rect.height), viewport.height, `${label}: full-height workspace`)
      assert.equal(await dialog.locator('.duuk-ai-drag-handle').count(), 0)
    }
    const overflow = await dialog.evaluate(el => el.scrollWidth > el.clientWidth + 1)
    assert.equal(overflow, false, `${label}: no dialog overflow`)
    assert.equal(await page.locator('.duuk-ai-help').isVisible(), false)
    assert.equal(await dialog.locator('.duuk-ai-suggestions button').count(), 4)
    assert.equal(await dialog.locator('.duuk-ai-welcome__mark > i').evaluate(el => getComputedStyle(el).animationName), 'none')
    await page.screenshot({ path: `${out}/ai-${label}.png` })

    const close = dialog.getByRole('button', { name: 'Fechar DUUK AI', exact: true })
    await close.focus()
    assert.equal(await close.evaluate(el => getComputedStyle(el).outlineStyle), 'none')
    await dialog.getByRole('button', { name: 'Criar roteiro', exact: true }).click()
    const input = dialog.getByRole('textbox', { name: 'Mensagem para o DUUK AI' })
    assert.match(await input.inputValue(), /roteiro audiovisual/)
    assert.equal(await dialog.getByRole('combobox', { name: 'Modo da conversa' }).inputValue(), 'script')
    await input.fill('Rascunho fictício que deve ser preservado.')
    // Simulate the iOS visual viewport shrinking while its keyboard is visible.
    if (width < 768) {
      await input.focus()
      await page.evaluate(() => { Object.defineProperty(visualViewport, 'height', { configurable: true, value: 440 }); visualViewport.dispatchEvent(new Event('resize')) })
      await page.waitForTimeout(100)
      const composer = await dialog.locator('.duuk-ai-composer').boundingBox()
      assert.ok(composer.y >= 0 && composer.y + composer.height <= 440, `${label}: composer above keyboard`)
      await page.screenshot({ path: `${out}/keyboard-${label}.png` })
    }
    await close.click()
    await page.getByRole('dialog', { name: 'Fechar DUUK AI?' }).waitFor()
    await page.getByRole('dialog', { name: 'Fechar DUUK AI?' }).locator('.admin-modal__foot').getByRole('button', { name: 'Fechar', exact: true }).click()
    await page.waitForSelector('.duuk-ai-floating-dialog', { state: 'detached' })
    assert.deepEqual(errors, [])
    report.push({ label, passed: true })
    console.log(`${label}: home, module popup, AI, keyboard, draft and focus passed`)
    await context.close()
  }

  // Permission filtering prevents both charts and requests for private sources.
  const permissions = Object.fromEntries(fixtures.permissionKeys.map(key => [key, key === 'agenda']))
  const restricted = await openAdmin(browser, origin, { permissions, profile: { ...fixtures.profile, is_super_admin: false } })
  assert.equal(await restricted.page.locator('.studio-pulse__card').count(), 1)
  assert.equal(await restricted.page.locator('.studio-pulse__heading').innerText(), 'Agenda')
  await restricted.context.close()

  // An unavailable source must not become a fictitious zero; a successful empty query must.
  const unavailable = await openAdmin(browser, origin)
  await unavailable.page.route('**/rest/v1/duuk_events**', route => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ message: 'Indisponível no teste' }) }))
  await unavailable.page.reload(); await settle(unavailable.page)
  await unavailable.page.waitForSelector('.studio-pulse__unavailable')
  const agenda = unavailable.page.locator('.studio-pulse__card').filter({ hasText: 'Agenda' })
  assert.match(await agenda.innerText(), /Não foi possível consultar/)
  assert.equal(await agenda.locator('strong').count(), 0)
  await unavailable.context.close()

  const tables = fixtures.tables(); tables.duuk_events = []
  const empty = await openAdmin(browser, origin, { tables })
  assert.match(await empty.page.locator('.studio-pulse__card').first().innerText(), /0/)
  await empty.context.close()

  const motion = await openAdmin(browser, origin, { reducedMotion: 'no-preference' })
  assert.match(await motion.page.locator('.studio-pulse__line polyline').evaluate(el => getComputedStyle(el).animationName), /studio-line-in/)
  await motion.context.close()
  console.log('Permissions, unavailable sources, empty data and optional motion passed')
} finally {
  await browser.close(); await server.close()
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2))
}

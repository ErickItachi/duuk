// All contracts, PDFs, OTPs and signatures below are fictional and intercepted.
// This script never calls the real Supabase project or sends a real email.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { installSupabaseMock, SUPABASE_URL } from './supabase-mock.mjs'
import { layoutIssues, startServer } from './screens.mjs'
import * as fixtures from './fixtures.mjs'
import releases from '../../src/admin/releases.json' with { type: 'json' }

const id = '11111111-1111-4111-8111-111111111111', token = 'a'.repeat(64)
const originalUrl = `${SUPABASE_URL}/storage/v1/object/sign/duuk-documents/original/fixture.pdf?token=fixture-original`
const signedUrl = `${SUPABASE_URL}/storage/v1/object/sign/duuk-documents/signed/fixture.pdf?token=fixture-signed`
const fields = [{ id: '22222222-2222-4222-8222-222222222222', type: 'signature', party: 'client', page: 1, x: .1, y: .7, width: .4, height: .1, label: '' }]
const contract = { id, title: 'Contrato fictício — Teste de aceite', client_name: 'Cliente Fictício', client_email: 'cliente@exemplo.test', duuk_name: 'Equipe Fictícia', status: 'signed', version: 3, rendered_version: 3, created_at: '2026-10-14T12:00:00Z', pages: [{ width: 595, height: 842 }, { width: 595, height: 842 }], fields, signed_path: 'signed/fixture.pdf', deleted_at: null }
const signature = { id: '33333333-3333-4333-8333-333333333333', party: 'client', signer_name: 'Cliente Fictício', signed_at: '2026-10-14T12:00:00Z', consent: 'Aceite fictício', field_values: {} }
const unsigned = { id, title: contract.title, party: 'client', name: 'Cliente Fictício', pages: contract.pages, fields, status: 'pending', signed: false, expires_at: '2026-10-21T01:02:00Z', verification: { required: true, verified: true, email_hint: 'c***@exemplo.test' }, original_url: originalUrl, signed_url: null }

async function pdfBytes(count) {
  const document = await PDFDocument.create(), font = await document.embedFont(StandardFonts.Helvetica)
  for (let page = 0; page < count; page++) document.addPage([595, 842]).drawText(page === 2 ? 'Registro de aceite ficticio' : `Contrato ficticio - pagina ${page + 1}`, { x: 40, y: 790, font, size: 18 })
  return Buffer.from(await document.save())
}
const [originalPdf, signedPdf] = await Promise.all([pdfBytes(2), pdfBytes(3)])
const output = process.env.DUUK_CONTRACT_RESULTS || 'test-results/contracts'
await mkdir(output, { recursive: true })
const { server, origin } = await startServer()
const browser = await chromium.launch({ executablePath: process.env.DUUK_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
const report = []

async function openFixture(width, theme, route, signHandler, adminDetails = { contract, signatures: [signature], invites: [], original_url: originalUrl, signed_url: signedUrl }) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: theme, hasTouch: width < 1024, isMobile: width < 768 })
  const requests = [], errors = []
  context.on('request', request => requests.push(request.url()))
  const storage = async route => {
    const url = new URL(route.request().url())
    return route.fulfill({ status: 200, headers: { 'content-type': 'application/pdf', 'access-control-allow-origin': '*', ...(url.searchParams.has('download') ? { 'content-disposition': `attachment; filename="${url.searchParams.get('download')}"` } : {}) }, body: url.pathname.includes('/signed/') ? signedPdf : originalPdf })
  }
  await context.route(`${SUPABASE_URL}/storage/v1/object/sign/duuk-documents/**`, storage)
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  const mock = await installSupabaseMock(page, { user: fixtures.user, profile: fixtures.profile, permissions: fixtures.permissions, tables: fixtures.tables(), rpc: fixtures.rpc, theme, functions: { ...fixtures.functions, 'duuk-office': body => { assert.equal(body.action, 'details'); return adminDetails }, 'duuk-sign': signHandler }, localStorage: { [`duuk-release-seen:${fixtures.user.id}:${releases[0].version}`]: '1' } })
  // Page routes precede context routes, so override the generic Supabase double.
  await page.route(`${SUPABASE_URL}/storage/v1/object/sign/duuk-documents/**`, storage)
  await page.goto(origin + route)
  return { context, page, mock, requests, errors }
}

try {
  for (const width of [320, 820, 1440]) for (const theme of ['dark', 'light']) {
    const fixture = await openFixture(width, theme, `/admin/contratos/${id}`)
    const { page, context } = fixture
    await page.locator('canvas[aria-label="Página 1 do PDF"]').waitFor({ state: 'visible' })
    assert.equal(await page.getByLabel('Página do PDF').locator('option').count(), 3)
    assert.equal(await page.locator('.office-pdf-field').count(), 0)
    await page.getByLabel('Página do PDF').selectOption('2')
    await page.locator('canvas[aria-label="Página 3 do PDF"]').waitFor({ state: 'visible' })
    await page.getByRole('button', { name: 'PDF original', exact: true }).click()
    await page.locator('canvas[aria-label="Página 1 do PDF"]').waitFor({ state: 'visible' })
    assert.equal(await page.getByLabel('Página do PDF').locator('option').count(), 2)
    await page.getByRole('button', { name: 'PDF assinado', exact: true }).click()
    await page.locator('canvas[aria-label="Página 1 do PDF"]').waitFor({ state: 'visible' })
    const detailsBefore = fixture.mock.calls.filter(call => call.path.includes('/duuk-office')).length
    const downloadRequest = context.waitForEvent('request', { predicate: request => new URL(request.url()).searchParams.get('download')?.startsWith('duuk-assinado-') })
    await page.getByRole('button', { name: 'Baixar assinado', exact: true }).click()
    await downloadRequest
    assert(fixture.mock.calls.filter(call => call.path.includes('/duuk-office')).length > detailsBefore, 'download must renew authorization before navigation')
    const issues = await layoutIssues(page)
    await page.screenshot({ path: `${output}/admin-${theme}-${width}.png`, fullPage: true })
    assert.deepEqual(fixture.errors, []); assert.deepEqual(issues, [])
    report.push({ screen: 'admin-signed', width, theme, errors: fixture.errors, issues })
    await context.close()

    let signed = false, failAccess = false, proofSeen = false
    const signing = await openFixture(width, theme, `/assinar/${token}`, body => {
      if (failAccess) return { __status: 403, body: { error: 'Confirme novamente seu e-mail.' } }
      if (body.action === 'get') {
        proofSeen ||= body.verification_token === 'b'.repeat(64)
        if (body.verification_token !== 'b'.repeat(64)) return { title: '', fields: [], pages: [], signed: false, verification: { required: true, verified: false, email_hint: 'c***@exemplo.test' } }
        return { ...unsigned, signed, status: signed ? 'partial' : 'pending', signed_url: signed ? signedUrl : null }
      }
      if (body.action === 'request_otp') return { challenge_id: id, email_hint: 'c***@exemplo.test', expires_at: '2099-10-21T12:00:00Z', retry_at: '2026-10-14T12:00:00Z' }
      if (body.action === 'verify_otp') { assert.equal(body.code, '123456'); return { verification_token: 'b'.repeat(64), record: unsigned } }
      if (body.action === 'sign') { assert.equal(body.accepted, true); assert.match(body.png, /^data:image\/png;base64,/); assert.equal(body.verification_token, 'b'.repeat(64)); signed = true; return { ...unsigned, signed: true, status: 'partial', signed_url: signedUrl } }
      throw new Error(`unexpected action ${body.action}`)
    })
    const signPage = signing.page
    await signPage.getByRole('heading', { name: 'Confirme seu e-mail.' }).waitFor()
    assert.equal(await signPage.locator('canvas').count(), 0)
    await signPage.getByRole('textbox', { name: 'Nome completo' }).fill('Cliente Fictício')
    await signPage.getByRole('textbox', { name: 'E-mail do participante' }).fill('cliente@exemplo.test')
    await signPage.getByRole('button', { name: 'Receber código por e-mail' }).click()
    await signPage.getByLabel('Código de seis dígitos').fill('123456')
    await signPage.getByRole('button', { name: 'Confirmar e abrir contrato' }).click()
    await signPage.locator('canvas[aria-label="Página 1 do PDF"]').waitFor({ state: 'visible' })
    assert.match(await signPage.locator('.office-signing-title').innerText(), /20\/10\/2026, 22:02 \(horário de Brasília\)/)
    assert.equal(await signPage.getByRole('button', { name: 'Assinar documento', exact: true }).isDisabled(), true)
    await signPage.getByLabel('Página do documento').selectOption('1')
    await signPage.locator('canvas[aria-label="Página 2 do PDF"]').waitFor({ state: 'visible' })
    await signPage.getByLabel('Área para desenhar assinatura').scrollIntoViewIfNeeded()
    const box = await signPage.getByLabel('Área para desenhar assinatura').boundingBox()
    await signPage.mouse.move(box.x + 25, box.y + 40); await signPage.mouse.down()
    await signPage.mouse.move(box.x + 70, box.y + 70, { steps: 6 }); await signPage.mouse.move(box.x + 140, box.y + 35, { steps: 6 }); await signPage.mouse.up()
    await signPage.getByRole('checkbox').check()
    assert.equal(await signPage.getByRole('button', { name: 'Assinar documento', exact: true }).isEnabled(), true)
    const beforeIssues = await layoutIssues(signPage)
    await signPage.screenshot({ path: `${output}/acceptance-${theme}-${width}.png`, fullPage: true })
    assert.deepEqual(beforeIssues, [])
    await signPage.getByRole('button', { name: 'Assinar documento', exact: true }).click()
    await signPage.getByRole('heading', { name: 'Aguardando a outra assinatura.' }).waitFor()
    await signPage.locator('canvas[aria-label="Página 1 do PDF"]').waitFor({ state: 'visible' })
    assert.equal(await signPage.getByLabel('Página do documento').locator('option').count(), 3)
    assert.equal(await signPage.locator('.office-pdf-field').count(), 0)
    await signPage.getByLabel('Página do documento').selectOption('2')
    await signPage.locator('canvas[aria-label="Página 3 do PDF"]').waitFor({ state: 'visible' })
    const signDownloadRequest = signing.context.waitForEvent('request', { predicate: request => new URL(request.url()).searchParams.get('download')?.startsWith('duuk-contrato-') })
    await signPage.getByRole('button', { name: 'Baixar PDF assinado', exact: true }).click()
    await signDownloadRequest
    assert.equal(proofSeen, true)
    await signPage.evaluate(() => { window.open = () => null })
    await signPage.getByRole('button', { name: 'Baixar PDF assinado', exact: true }).click()
    await signPage.getByRole('link', { name: 'Baixar PDF preparado', exact: true }).waitFor()
    assert.equal(signPage.url(), `${origin}/assinar/${token}`, 'popup blocking must keep the signing page open')
    assert.equal(await signPage.getByRole('link', { name: 'Baixar PDF preparado', exact: true }).getAttribute('rel'), 'noopener noreferrer')
    const afterIssues = await layoutIssues(signPage)
    await signPage.screenshot({ path: `${output}/signed-${theme}-${width}.png`, fullPage: true })
    assert.deepEqual(signing.errors, []); assert.deepEqual(afterIssues, [])
    failAccess = true
    await signPage.getByRole('button', { name: 'Atualizar situação', exact: true }).click()
    await signPage.getByRole('heading', { name: 'Confirme seu e-mail.' }).waitFor()
    assert.equal(await signPage.locator('canvas').count(), 0, 'expired email access must hide the previous private PDF')
    report.push({ screen: 'accept-sign-download-revoke', width, theme, errors: signing.errors, issues: [...beforeIssues, ...afterIssues] })
    await signing.context.close()
    console.log(`contracts ${width}px ${theme}: preview, evidence pages, OTP, acceptance, signed download and access expiry passed`)
  }
  const draft = { ...contract, status: 'draft', signed_path: null, rendered_version: null }
  const pending = await openFixture(320, 'dark', `/admin/contratos/${id}`, undefined, { contract: draft, signatures: [], invites: [], original_url: originalUrl, signed_url: null })
  await pending.page.locator('canvas[aria-label="Página 1 do PDF"]').waitFor({ state: 'visible' })
  await pending.page.getByRole('button', { name: 'Adicionar campo', exact: true }).click()
  const editedFields = await pending.page.locator('.office-field-list > li').count()
  assert.equal(editedFields, 2)
  await pending.page.evaluate(() => { window.open = () => null })
  await pending.page.getByRole('button', { name: 'Baixar original', exact: true }).click()
  await pending.page.getByRole('link', { name: 'Baixar PDF preparado', exact: true }).waitFor()
  assert.equal(await pending.page.locator('.office-field-list > li').count(), editedFields, 'renewing download authorization must preserve edited fields')
  assert.equal(await pending.page.getByRole('button', { name: 'Salvar campos', exact: true }).isEnabled(), true)
  assert.equal(pending.page.url(), `${origin}/admin/contratos/${id}`)
  assert.deepEqual(await layoutIssues(pending.page), [])
  assert.deepEqual(pending.errors, [])
  report.push({ screen: 'blocked-popup-preserves-draft', width: 320, theme: 'dark', errors: pending.errors, issues: [] })
  await pending.context.close()
  console.log('contracts popup blocked: edited draft and current page preserved')
  let pendingReads = 0
  const recovering = await openFixture(320, 'dark', `/assinar/${token}`, body => {
    assert.equal(body.action, 'get', 'recovering a pending PDF must never register another signature')
    pendingReads++
    return { ...unsigned, signed: true, status: 'partial', verification: { required: false, verified: true }, signed_url: pendingReads > 1 ? signedUrl : null, pdf_pending: pendingReads === 1, pdf_error: pendingReads === 1 ? 'Sua assinatura foi registrada. O PDF está em preparação.' : null }
  })
  await recovering.page.getByRole('heading', { name: 'Aguardando a outra assinatura.' }).waitFor()
  await recovering.page.getByText('Sua assinatura foi registrada. O PDF está em preparação.', { exact: true }).waitFor()
  assert.equal(await recovering.page.locator('.office-signature').count(), 0)
  assert.equal(await recovering.page.locator('canvas').count(), 0)
  await recovering.page.getByRole('button', { name: 'Atualizar situação', exact: true }).click()
  await recovering.page.locator('canvas[aria-label="Página 1 do PDF"]').waitFor({ state: 'visible' })
  assert.equal(await recovering.page.getByLabel('Página do documento').locator('option').count(), 3)
  assert.equal(pendingReads, 2)
  assert.deepEqual(recovering.errors, [])
  assert.deepEqual(await layoutIssues(recovering.page), [])
  report.push({ screen: 'pending-pdf-recovers-without-signing-again', width: 320, theme: 'dark', errors: recovering.errors, issues: [] })
  await recovering.context.close()
  console.log('contracts pending PDF: signature retained and preview recovered without signing again')
} finally {
  await browser.close(); await server.close()
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2))
}

import assert from 'node:assert/strict'
import test from 'node:test'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { acceptanceRecord, brasiliaDateTime, browserLabel, drawAcceptanceRecord, pdfText } from '../supabase/functions/_shared/acceptance-record.mjs'
import { appleTouch, attachmentUrl, pdfName } from '../src/office/fileAccess.js'

const contract = { id: 'c0ffee00-0000-4000-8000-000000000000', title: 'Contrato de licenciamento — Estúdio Prisma', client_name: 'Estúdio Prisma', status: 'signed', original_sha256: 'a'.repeat(64), signed_sha256: 'b'.repeat(64) }
const signatures = [
  { id: 'sig-2', party: 'duuk', signer_name: 'Marina Teste', signed_at: '2026-10-14T21:22:27Z', consent: 'Li o documento e concordo em assiná-lo eletronicamente.', ip_address: '177.1.2.3', user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36' },
  { id: 'sig-1', party: 'client', signer_name: 'João Conceição', signed_at: '2026-10-14T21:19:24Z', consent: 'Li o documento e concordo.', verification_method: 'email_otp', verified_email: 'contato@exemplo.test', email_verified_at: '2026-10-14T21:17:02Z', ip_address: '200.100.50.25', user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7.5 Mobile/15E148 Safari/604.1' },
]

test('Acceptance record shows Brasília time, signs in order and keeps IP/browser out of the shared PDF', () => {
  assert.equal(brasiliaDateTime('2026-10-14T21:19:24Z'), '14/10/2026 às 18:19:24 (Brasília)')
  const shared = acceptanceRecord({ contract, signatures })
  assert.deepEqual(shared.signers.map(signer => signer.partyLabel), ['Cliente', 'DUUK'])
  assert.ok(shared.signers[0].rows.some(([label, value]) => label === 'E-mail confirmado' && value === 'contato@exemplo.test'))
  assert.ok(!JSON.stringify(shared).includes('200.100.50.25'))
  assert.ok(!shared.contract.some(([label]) => label === 'SHA-256 do PDF assinado'))
  const internal = acceptanceRecord({ contract, signatures, detailed: true })
  assert.ok(internal.signers[0].rows.some(([label, value]) => label === 'Endereço IP' && value === '200.100.50.25'))
  assert.ok(internal.signers[0].rows.some(([label, value]) => label === 'Navegador' && value === 'Safari · iPhone · iOS 18.7'))
  assert.equal(browserLabel(signatures[0].user_agent), 'Chrome · Windows')
  assert.equal(browserLabel(''), 'Não informado')
  assert.ok(shared.notes.some(note => note.includes('sem certificado ICP-Brasil')))
})

test('Acceptance record keeps Portuguese accents and draws one page for two signers', async () => {
  assert.equal(pdfText('Conceição “aceite” — ✓'), 'Conceição “aceite” — ?')
  const pdf = await PDFDocument.create()
  const pages = await drawAcceptanceRecord(pdf, { rgb, StandardFonts }, acceptanceRecord({ contract, signatures, detailed: true }))
  assert.equal(pages, 1)
  assert.ok((await pdf.save()).length > 1000)
})

test('Private PDFs download by URL with a readable name; iPhone opens a tab instead', () => {
  const url = attachmentUrl('https://example.supabase.co/storage/v1/object/sign/duuk-documents/signed/a.pdf?token=abc', 'Contrato X - assinado.pdf')
  assert.equal(new URL(url).searchParams.get('token'), 'abc')
  assert.equal(new URL(url).searchParams.get('download'), 'Contrato X - assinado.pdf')
  assert.equal(pdfName('Contrato: A/B\n2026', 'assinado'), 'Contrato A B 2026 - assinado.pdf')
  assert.equal(pdfName('', 'original'), 'contrato - original.pdf')
  assert.equal(appleTouch({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 }), true)
  assert.equal(appleTouch({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 }), true)
  assert.equal(appleTouch({ userAgent: 'Mozilla/5.0 (Windows NT 10.0)', platform: 'Win32', maxTouchPoints: 0 }), false)
})

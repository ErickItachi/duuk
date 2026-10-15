// Readable acceptance record shared by the signed PDF (Edge Functions) and the
// admin "Registro de aceite" (browser). Takes pdf-lib from the caller so the
// same layout runs in Deno and in Vite.

const zone = 'America/Sao_Paulo'
export const partyNames = { client: 'Cliente', duuk: 'DUUK' }

export function brasiliaDateTime(value) {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return '—'
  const parts = Object.fromEntries(new Intl.DateTimeFormat('pt-BR', { timeZone: zone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date).map(part => [part.type, part.value]))
  return `${parts.day}/${parts.month}/${parts.year} às ${parts.hour}:${parts.minute}:${parts.second} (Brasília)`
}

// A short, human description of the signer's browser. The full user agent stays in the technical export.
export function browserLabel(agent) {
  const ua = String(agent || '')
  if (!ua) return 'Não informado'
  const browser = /EdgiOS|EdgA?\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) && !/OPR\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /OPR\//.test(ua) ? 'Opera' : /Safari\//.test(ua) ? 'Safari' : 'Navegador'
  const ios = ua.match(/(iPhone|iPad|iPod).*? OS (\d+)[_.](\d+)/)
  const device = ios ? `${ios[1]} · iOS ${ios[2]}.${ios[3]}` : /Android (\d+(?:\.\d+)?)/.test(ua) ? `Android ${ua.match(/Android (\d+(?:\.\d+)?)/)[1]}` : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : ''
  return device ? `${browser} · ${device}` : browser
}

// Data for the record. `detailed` adds IP and browser, which stay inside the admin.
export function acceptanceRecord({ contract, signatures = [], detailed = false, generatedAt = new Date().toISOString() }) {
  const ordered = [...signatures].sort((a, b) => String(a.signed_at).localeCompare(String(b.signed_at)))
  const signers = ordered.map(signature => {
    const rows = [['Assinado em', brasiliaDateTime(signature.signed_at)]]
    if (signature.verification_method === 'email_otp') {
      rows.push(['E-mail confirmado', signature.verified_email || '—'], ['Confirmação do e-mail', brasiliaDateTime(signature.email_verified_at)])
    } else rows.push(['Acesso', 'Link privado enviado pela DUUK'])
    if (detailed) rows.push(['Endereço IP', signature.ip_address || 'Não informado'], ['Navegador', browserLabel(signature.user_agent)])
    rows.push(['Registro', signature.id])
    return {
      id: signature.id,
      party: signature.party,
      partyLabel: partyNames[signature.party] || signature.party,
      name: signature.signer_name,
      consent: signature.consent || 'Li o documento e concordo em assiná-lo eletronicamente.',
      rows,
      png: signature.png || null,
    }
  })
  const status = contract.status === 'signed' ? 'Concluído, com as duas assinaturas' : signers.length ? `${signers.length} de 2 assinaturas recebidas` : 'Aguardando assinaturas'
  return {
    title: 'Registro de assinatura eletrônica',
    contract: [
      ['Contrato', contract.title],
      ['Cliente', contract.client_name || '—'],
      ['Situação', status],
      ['Identificador', contract.id],
      ['SHA-256 do PDF original', contract.original_sha256 || '—'],
      ...(detailed && contract.signed_sha256 ? [['SHA-256 do PDF assinado', contract.signed_sha256]] : []),
      ['Registro gerado em', brasiliaDateTime(generatedAt)],
    ],
    signers,
    notes: [
      'Assinatura eletrônica por aceite e desenho, sem certificado ICP-Brasil.',
      'A confirmação por código comprova o acesso à caixa de e-mail, não a identidade civil.',
      detailed ? 'Documento interno da DUUK: contém endereço IP e navegador dos participantes.' : 'O registro completo, com IP e navegador, fica restrito ao administrativo da DUUK.',
    ],
  }
}

// Standard PDF fonts only encode WinAnsi; keep Portuguese accents and typographic quotes, replace the rest.
const extra = new Set([...'“”‘’–—…•·€'])
export function pdfText(value) {
  return Array.from(String(value ?? '').normalize('NFC').replace(/[\r\n\t]+/g, ' '), char => {
    const code = char.codePointAt(0)
    return (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || extra.has(char) ? char : '?'
  }).join('')
}

function wrap(text, font, size, width) {
  const lines = []
  for (const word of pdfText(text).split(' ')) {
    const last = lines.length ? lines[lines.length - 1] : null
    const joined = last === null ? word : `${last} ${word}`
    if (last !== null && font.widthOfTextAtSize(joined, size) <= width) { lines[lines.length - 1] = joined; continue }
    // Long tokens (hashes, ids) break by character.
    let part = ''
    for (const char of word) {
      if (part && font.widthOfTextAtSize(part + char, size) > width) { lines.push(part); part = '' }
      part += char
    }
    lines.push(part)
  }
  return lines.length ? lines : ['']
}

export async function drawAcceptanceRecord(pdf, { rgb, StandardFonts }, record) {
  const regular = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold), mono = await pdf.embedFont(StandardFonts.Courier)
  const ink = rgb(0.09, 0.09, 0.1), muted = rgb(0.4, 0.4, 0.43), line = rgb(0.86, 0.86, 0.88), accent = rgb(0.92, 0.35, 0.05), soft = rgb(0.97, 0.97, 0.975)
  const W = 595, H = 842, M = 48, inner = W - M * 2
  let page, y, number = 0
  const pages = []
  const footer = target => {
    target.drawLine({ start: { x: M, y: 44 }, end: { x: W - M, y: 44 }, thickness: 0.5, color: line })
    target.drawText(pdfText('DUUK Films · Registro de assinatura eletrônica'), { x: M, y: 30, size: 8, font: regular, color: muted })
  }
  const newPage = () => {
    page = pdf.addPage([W, H]); pages.push(page); number++
    page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: accent })
    y = H - 56
    if (number > 1) { page.drawText(pdfText(`${record.title} (continuação)`), { x: M, y, size: 10, font: bold, color: muted }); y -= 26 }
    footer(page)
  }
  const ensure = height => { if (!page || y - height < 64) newPage() }
  const text = (value, { font = regular, size = 10, color = ink, x = M, width = inner, gap = 4 } = {}) => {
    for (const row of wrap(value, font, size, width)) { ensure(size + gap); page.drawText(row, { x, y: y - size, size, font, color }); y -= size + gap }
  }
  const pair = (label, value, x = M, width = inner, labelWidth = 150) => {
    const isHash = /^[a-f0-9-]{32,}$/i.test(String(value))
    const rows = wrap(value, isHash ? mono : regular, isHash ? 8.5 : 10, width - labelWidth)
    ensure(rows.length * 14 + 4)
    page.drawText(pdfText(label), { x, y: y - 10, size: 9, font: regular, color: muted })
    rows.forEach((row, index) => page.drawText(row, { x: x + labelWidth, y: y - 10 - index * 14, size: isHash ? 8.5 : 10, font: isHash ? mono : regular, color: ink }))
    y -= rows.length * 14 + 4
  }

  newPage()
  page.drawText('DUUK', { x: M, y: y - 12, size: 12, font: bold, color: accent })
  y -= 30
  text(record.title, { font: bold, size: 20, gap: 10 })
  for (const [label, value] of record.contract) pair(label, value)
  y -= 10

  for (const signer of record.signers) {
    const image = signer.png ? await pdf.embedPng(signer.png).catch(() => null) : null
    const columns = image ? inner - 184 : inner
    const consentLines = wrap(`“${signer.consent}”`, regular, 9.5, inner - 28)
    const rowsHeight = signer.rows.reduce((sum, [, value]) => sum + wrap(value, regular, 10, columns - 120).length * 14 + 4, 0)
    // Keep each signer on one page: heading, details, signature and accepted text.
    ensure(Math.min(64 + Math.max(rowsHeight, image ? 70 : 0) + consentLines.length * 13 + 40, H - 140))
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: line })
    y -= 22
    page.drawText(pdfText(signer.partyLabel.toUpperCase()), { x: M, y, size: 8.5, font: bold, color: accent })
    y -= 8
    text(signer.name, { font: bold, size: 14, gap: 8 })
    const top = y
    if (image) {
      const box = image.scaleToFit(154, 52), left = W - M - 170
      page.drawRectangle({ x: left, y: top - 66, width: 170, height: 66, color: soft })
      page.drawImage(image, { x: left + (170 - box.width) / 2, y: top - 33 - box.height / 2, width: box.width, height: box.height })
    }
    for (const [label, value] of signer.rows) pair(label, value, M, columns, 120)
    y = Math.min(y, image ? top - 74 : y) - 4
    page.drawText(pdfText('Aceite registrado'), { x: M, y: y - 9, size: 9, font: regular, color: muted })
    y -= 16
    const quoteTop = y, quoteHeight = consentLines.length * 13 + 12
    page.drawRectangle({ x: M, y: y - quoteHeight, width: inner, height: quoteHeight, color: soft })
    page.drawRectangle({ x: M, y: y - quoteHeight, width: 3, height: quoteHeight, color: accent })
    consentLines.forEach((row, index) => page.drawText(row, { x: M + 14, y: quoteTop - 15 - index * 13, size: 9.5, font: regular, color: ink }))
    y = quoteTop - quoteHeight - 14
  }

  ensure(12 + record.notes.length * 13.5)
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: line })
  y -= 10
  for (const note of record.notes) text(note, { size: 8.5, color: muted, gap: 5 })
  pages.forEach((target, index) => {
    const label = `${index + 1} de ${pages.length}`
    target.drawText(label, { x: W - M - regular.widthOfTextAtSize(label, 8), y: 30, size: 8, font: regular, color: muted })
  })
  return pages.length
}

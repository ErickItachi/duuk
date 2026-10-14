export const ofxLimits = Object.freeze({ bytes: 2 * 1024 * 1024, transactions: 2000 })

function decodeEntities(value) {
 return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity) => {
  if (entity[0] !== '#') return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[entity.toLowerCase()]
  const number = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1))
  if (number < 32 || number > 0x10ffff || number >= 0xd800 && number <= 0xdfff) throw new Error('O extrato contém caracteres inválidos.')
  return String.fromCodePoint(number)
 }).trim()
}
function field(block, name, required = true) {
 const values = [...block.matchAll(new RegExp(`<${name}\\s*>([^<]*)`, 'gi'))]
 if (values.length > 1) throw new Error(`O extrato contém o campo ${name} repetido.`)
 const value = values.length ? decodeEntities(values[0][1]) : ''
 if (required && !value) throw new Error(`O extrato não contém ${name}. Exporte novamente em OFX.`)
 return value
}
function ofxDate(value) {
 if (!/^\d{8}(?:\d{6}(?:\.\d+)?(?:\[[^\]]+\])?)?$/.test(value)) throw new Error('O extrato contém uma data inválida.')
 const result = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
 const date = new Date(`${result}T12:00:00Z`)
 if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== result || result < '1900-01-01' || result > '2099-12-31') throw new Error('O extrato contém uma data inválida.')
 return result
}
export function ofxCents(value) {
 if (!/^[+-]?\d{1,10}(?:\.\d{1,2})?$/.test(value)) throw new Error('O extrato contém um valor inválido. Use o OFX original do banco.')
 const sign = value[0] === '-' ? -1 : 1, [whole, decimal = ''] = value.replace(/^[+-]/, '').split('.')
 const result = sign * (Number(whole) * 100 + Number(decimal.padEnd(2, '0')))
 if (!Number.isSafeInteger(result) || Math.abs(result) > 100000000000) throw new Error('Um valor do extrato ultrapassa o limite do financeiro.')
 return result
}
export function parseOfx(source) {
 if (typeof source !== 'string' || new TextEncoder().encode(source).length > ofxLimits.bytes) throw new Error('Escolha um OFX de até 2 MB.')
 if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('Este OFX contém declarações externas não permitidas.')
 const text = source.replace(/<!--[\s\S]*?-->/g, '')
 if (!/<OFX\s*>/i.test(text) || !/<\/OFX\s*>/i.test(text) || /<CCACCTFROM\s*>/i.test(text)) throw new Error('Envie o extrato OFX da conta bancária, não uma fatura do cartão.')
 if ((text.match(/<STMTRS\s*>/gi) || []).length !== 1) throw new Error('Importe uma conta por arquivo OFX.')
 const account = text.match(/<BANKACCTFROM\s*>([\s\S]*?)<\/BANKACCTFROM\s*>/i)?.[1]
 if (!account) throw new Error('O extrato não identifica a conta bancária.')
 const bankId = field(account, 'BANKID'), accountId = field(account, 'ACCTID'), currency = field(text, 'CURDEF').toUpperCase()
 if (currency !== 'BRL') throw new Error('O financeiro aceita extratos em reais (BRL).')
 if (!/^[\w.-]{1,80}$/.test(bankId) || !/^[\w .-]{1,160}$/.test(accountId)) throw new Error('O extrato contém uma identificação de conta inválida.')
 const blocks = [...text.matchAll(/<STMTTRN\s*>([\s\S]*?)<\/STMTTRN\s*>/gi)]
 if (!blocks.length || blocks.length > ofxLimits.transactions || blocks.length !== (text.match(/<STMTTRN\s*>/gi) || []).length) throw new Error('Envie um OFX válido com 1 a 2.000 movimentações.')
 const transactions = [], seen = new Map(); let duplicates = 0, zeroValues = 0
 for (const [, block] of blocks) {
  const fit_id = field(block, 'FITID'), posted_date = ofxDate(field(block, 'DTPOSTED')), amount_cents = ofxCents(field(block, 'TRNAMT'))
  const name = field(block, 'NAME', false), memo = field(block, 'MEMO', false), title = (name || memo || 'Movimentação do extrato').slice(0, 160), description = [name, memo].filter(Boolean).join('\n').slice(0, 500)
  if (fit_id.length > 250) throw new Error('Uma movimentação tem identificação inválida.')
  const previous = seen.get(fit_id)
  if (previous) {
   if (previous.posted_date !== posted_date || previous.amount_cents !== amount_cents) throw new Error('O extrato contém a mesma identificação com valores ou datas diferentes.')
   duplicates++; continue
  }
  const transaction = { fit_id, posted_date, amount_cents, title, description }; seen.set(fit_id, transaction)
  if (!amount_cents) { zeroValues++; continue }
  transactions.push(transaction)
 }
 if (!transactions.length) throw new Error('Este extrato não contém movimentações com valor.')
 const ledger = text.match(/<LEDGERBAL\s*>([\s\S]*?)<\/LEDGERBAL\s*>/i)?.[1]
 const balance = ledger ? { amount_cents: ofxCents(field(ledger, 'BALAMT')), date: ofxDate(field(ledger, 'DTASOF')) } : null
 const dates = transactions.map(row => row.posted_date).sort()
 return { bank_id: bankId, account_id: accountId, currency, transactions, balance, from: dates[0], to: dates.at(-1), duplicates, zeroValues }
}
export async function readOfxFile(file) {
 if (!file || file.size > ofxLimits.bytes || !/\.ofx$/i.test(file.name)) throw new Error('Escolha um arquivo .ofx de até 2 MB.')
 const bytes = await file.arrayBuffer(); let source
 try { source = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { source = new TextDecoder('windows-1252').decode(bytes) }
 const statement = parseOfx(source), digest = await crypto.subtle.digest('SHA-256', bytes)
 return { ...statement, file_name: file.name.slice(0, 180), file_hash: Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('') }
}
export function bankRecordState(row) {
 const record = row.income || row.expense
 if (record) return record.status === 'paid' && record.paid_date === row.posted_date && Number(record.amount_cents) === Math.abs(Number(row.amount_cents)) ? 'linked' : 'mismatch'
 return row.ignored_at ? 'ignored' : 'pending'
}

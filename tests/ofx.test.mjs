import test from 'node:test'
import assert from 'node:assert/strict'
import { bankRecordState, ofxCents, parseOfx } from '../src/finance/ofx.mjs'
const transaction = (id, amount = '123.45', date = '20261013120000[-3:BRT]') => `<STMTTRN><DTPOSTED>${date}<TRNAMT>${amount}<FITID>${id}<MEMO>Pix &amp; produção</STMTTRN>`
const file = rows => `OFXHEADER:100\nENCODING:USASCII\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL<BANKACCTFROM><BANKID>260<ACCTID>123456789<ACCTTYPE>CHECKING</BANKACCTFROM><BANKTRANLIST>${rows}</BANKTRANLIST><LEDGERBAL><BALAMT>-42.10<DTASOF>20261013</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`
test('OFX SGML and XML preserve bank dates, exact cents, private account identity and balance date', () => {
 const parsed = parseOfx(file(transaction('a') + transaction('b', '-0.10')))
 assert.equal(parsed.transactions[0].amount_cents, 12345); assert.equal(parsed.transactions[1].amount_cents, -10)
 assert.equal(parsed.transactions[0].posted_date, '2026-10-13'); assert.equal(parsed.transactions[0].title, 'Pix & produção')
 assert.deepEqual(parsed.balance, { amount_cents: -4210, date: '2026-10-13' })
 const xml = file('<STMTTRN><DTPOSTED>20261013</DTPOSTED><TRNAMT>1.01</TRNAMT><FITID>xml</FITID><NAME>A &#233; B</NAME></STMTTRN>')
 assert.equal(parseOfx(xml).transactions[0].title, 'A é B')
})
test('same-file duplicates are counted, conflicting identities abort, and zero movements cannot become bills', () => {
 assert.equal(parseOfx(file(transaction('a') + transaction('a'))).duplicates, 1)
 assert.throws(() => parseOfx(file(transaction('a') + transaction('a', '1.00'))), /mesma identificação/)
 assert.equal(parseOfx(file(transaction('a') + transaction('zero', '0.00'))).zeroValues, 1)
 assert.throws(() => parseOfx(file(transaction('zero', '0.00'))), /não contém movimentações/)
})
test('malformed, ambiguous, oversized and external-entity statements never reach import', () => {
 for (const source of [file(transaction('a')).replace('<FITID>a', ''), file(transaction('a', '1e3')), file(transaction('a', '1.001')), file(transaction('a', '1.00', '20260230')), file(transaction('a')).replace('<CURDEF>BRL', '<CURDEF>USD'), file(transaction('a')).replace('<STMTRS>', '<STMTRS><STMTRS>'), file(transaction('a')).replace('</STMTTRN>', ''), '<!DOCTYPE OFX SYSTEM "https://example.invalid">' + file(transaction('a')), file(transaction('a')).replace('<BANKACCTFROM>', '<CCACCTFROM>'), 'x'.repeat(2*1024*1024+1)]) assert.throws(() => parseOfx(source))
})
test('currency conversion uses integer minor units and rejects rounded or unbounded amounts', () => {
 assert.equal(ofxCents('0.29'),29);assert.equal(ofxCents('-999999999.99'),-99999999999);assert.equal(ofxCents('+42'),4200)
 for(const value of ['1,20','NaN','1.001','1000000000.01','--1','Infinity'])assert.throws(()=>ofxCents(value))
})
test('bank link state detects later financial edits instead of presenting a false reconciliation', () => {
 const row={posted_date:'2026-10-13',amount_cents:-1000,income:null,expense:null,ignored_at:null}
 assert.equal(bankRecordState(row),'pending');assert.equal(bankRecordState({...row,ignored_at:'now'}),'ignored')
 const expense={status:'paid',paid_date:row.posted_date,amount_cents:1000}
 assert.equal(bankRecordState({...row,expense}),'linked')
 for(const changed of [{status:'pending'},{paid_date:'2026-10-12'},{amount_cents:999}])assert.equal(bankRecordState({...row,expense:{...expense,...changed}}),'mismatch')
})

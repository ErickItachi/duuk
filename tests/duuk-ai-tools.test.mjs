import assert from 'node:assert/strict'
import test from 'node:test'
import { actionInputBound, actionInstructions, maxToolCalls, needsActionReasoning, normalizeCompletedToolCalls, normalizeToolCalls, toolsFor } from '../supabase/functions/_shared/duuk-ai-tools.mjs'

const grants = { agenda: true, finance: true, 'crm.followups': true }
const call = (name, args) => ({ name, args })
const invalid = operation => assert.throws(operation, error => error.code === 'DUUK_AI_INVALID_TOOL_CALL' && !error.message.includes('secret'))

test('native declarations expose only backend grants and contain no record or actor IDs', () => {
 assert.deepEqual(toolsFor({ is_super_admin: true, permissions: ['agenda'], agenda: 'true' }), [])
 assert.deepEqual(toolsFor(Object.create({ agenda: true })), [])
 assert.deepEqual(toolsFor(null), [])
 const expected = ['prepare_agenda_event', 'prepare_expense', 'prepare_followup', 'view_agenda']
 assert.deepEqual(toolsFor(grants)[0].functionDeclarations.map(item => item.name), expected)
 assert.deepEqual(toolsFor(new Set(['finance', 'unknown']))[0].functionDeclarations.map(item => item.name), ['prepare_expense'])
 assert.deepEqual(toolsFor(['agenda'])[0].functionDeclarations.map(item => item.name), ['prepare_agenda_event', 'view_agenda'])
 for (const definition of toolsFor(grants)[0].functionDeclarations) {
  assert.equal(definition.parameters, undefined)
  assert.equal(definition.parametersJsonSchema.additionalProperties, false)
  assert.ok(Object.keys(definition.parametersJsonSchema.properties).every(key => !key.endsWith('_id') && !key.includes('version')))
 }
 const altered = toolsFor(grants)
 altered[0].functionDeclarations[0].parametersJsonSchema.properties.title.maxLength = 9000
 assert.equal(toolsFor(grants)[0].functionDeclarations[0].parametersJsonSchema.properties.title.maxLength, 160)
})

test('tool calls prepare a faithful bounded draft without generating IDs, defaults or execution results', () => {
 const result = normalizeToolCalls([
  { id: 'provider-call-id', name: 'prepare_agenda_event', args: { title: ' Reunião de briefing ', start_date: '2026-10-10', end_date: '2026-10-10', all_day: false, start_time: '14:30', responsible_hint: ' Erick ', category: 'meeting', status: 'planned' } },
  call('prepare_expense', { title: 'Gasolina', amount_cents: 12050, due_date: '2026-10-10', category: 'travel', status: 'pending', paid_date: null }),
  call('prepare_followup', { client_hint: 'Cliente fictício', notes: 'Conferir briefing', due_at: '2026-10-10T09:00:00-03:00', owner_hint: 'Ana' }),
 ], grants)
 assert.deepEqual(result, [
  { kind: 'agenda.create', payload: { title: 'Reunião de briefing', start_date: '2026-10-10', end_date: '2026-10-10', all_day: false, start_time: '14:30', responsible_hint: 'Erick', category: 'meeting', status: 'planned' } },
  { kind: 'expense.create', payload: { title: 'Gasolina', amount_cents: 12050, due_date: '2026-10-10', category: 'travel', status: 'pending', paid_date: null } },
  { kind: 'followup.create', payload: { client_hint: 'Cliente fictício', notes: 'Conferir briefing', due_at: '2026-10-10T09:00:00-03:00', owner_hint: 'Ana' } },
 ])
 assert.equal(maxToolCalls, 3)
 assert.ok(!JSON.stringify(result).includes('provider-call-id'))
})

test('action preparation requires a natural provider stop, not EOF, a token limit or a safety interruption', () => {
 const input = [call('prepare_agenda_event', { title: 'Reunião', start_date: '2026-10-10', start_time: '14:00', all_day: false })]
 assert.deepEqual(normalizeCompletedToolCalls(input, grants, 'STOP'), normalizeToolCalls(input, grants))
 for (const reason of [undefined, null, '', 'MAX_TOKENS', 'SAFETY', 'RECITATION', 'MALFORMED_FUNCTION_CALL', 'UNEXPECTED_TOOL_CALL', 'OTHER', 'STOP ']) invalid(() => normalizeCompletedToolCalls(input, grants, reason))
 invalid(() => normalizeCompletedToolCalls(input, {}, 'STOP'))
 invalid(() => normalizeCompletedToolCalls([call('prepare_agenda_event', { title: 'Reunião', responsible_id: 'secret' })], grants, 'STOP'))
})

test('incomplete drafts retain missing values for review instead of inventing dates, amounts or member references', () => {
 assert.deepEqual(normalizeToolCalls([call('prepare_agenda_event', { title: 'Reunião', all_day: false, responsible_hint: '' })], grants), [{ kind: 'agenda.create', payload: { title: 'Reunião', all_day: false, responsible_hint: '' } }])
 assert.deepEqual(normalizeToolCalls([call('prepare_expense', { title: 'Fornecedor', amount_cents: null, due_date: null })], grants), [{ kind: 'expense.create', payload: { title: 'Fornecedor', amount_cents: null, due_date: null } }])
 assert.deepEqual(normalizeToolCalls([call('prepare_followup', { client_hint: 'Cliente fictício', due_at: null })], grants), [{ kind: 'followup.create', payload: { client_hint: 'Cliente fictício', due_at: null } }])
 for (const args of [{}, { title: '   ' }, { title: null }]) invalid(() => normalizeToolCalls([call('prepare_agenda_event', args)], grants))
 invalid(() => normalizeToolCalls([call('prepare_followup', { client_hint: '' })], grants))
})

test('tools cannot elevate permissions, smuggle IDs or execute arbitrary names', () => {
 for (const [name, args, permission] of [
  ['prepare_agenda_event', { title: 'Reunião' }, 'agenda'],
  ['prepare_expense', { title: 'Despesa' }, 'finance'],
  ['prepare_followup', { client_hint: 'Cliente' }, 'crm.followups'],
  ['view_agenda', { date_start: '2026-10-10', date_end: '2026-10-10' }, 'agenda'],
 ]) {
  invalid(() => normalizeToolCalls([call(name, args)], { ...grants, [permission]: false, is_super_admin: true }))
  for (const key of ['user_id', 'responsible_id', 'client_id', 'owner_id', 'client_version', 'sql', 'permissions', '__proto__', 'constructor', 'prototype']) {
   invalid(() => normalizeToolCalls([call(name, Object.fromEntries([...Object.entries(args), [key, 'secret']]))], grants))
  }
 }
 for (const name of ['execute_sql', 'delete_event', 'send_whatsapp', 'prepare_agenda_event ', 'PREPARE_AGENDA_EVENT', '__proto__']) invalid(() => normalizeToolCalls([call(name, { title: 'Reunião' })], grants))
})

test('normalizer rejects malformed, oversized, inherited and partial SDK call shapes', () => {
 assert.deepEqual(normalizeToolCalls(undefined, grants), [])
 assert.deepEqual(normalizeToolCalls(null, grants), [])
 assert.deepEqual(normalizeToolCalls([], grants), [])
 const good = call('prepare_agenda_event', { title: 'Reunião' })
 for (const input of ['secret', {}, [null], [true], [[good]], [{ ...good, args: '{"title":"secret"}' }], [{ ...good, args: [] }], [{ ...good, args: new Date() }], [{ ...good, name: null }], [{ ...good, id: {} }], [{ ...good, partialArgs: [] }], [{ ...good, willContinue: true }], [good, good, good, good]]) invalid(() => normalizeToolCalls(input, grants))
 invalid(() => normalizeToolCalls([call('prepare_agenda_event', Object.assign(Object.create({ responsible_id: 'secret' }), { title: 'Reunião' }))], grants))
 const getter = Object.defineProperty({}, 'title', { enumerable: true, get() { throw new Error('secret getter must not run') } })
 invalid(() => normalizeToolCalls([call('prepare_agenda_event', getter)], grants))
 invalid(() => normalizeToolCalls([call('prepare_agenda_event', Object.defineProperty({}, 'title', { value: 'Hidden', enumerable: false }))], grants))
 const symbol = { title: 'Reunião', [Symbol('secret')]: true }
 invalid(() => normalizeToolCalls([call('prepare_agenda_event', symbol)], grants))
 for (const args of [{ title: 'x'.repeat(161) }, { title: 'A', description: 'x'.repeat(2001) }, { title: 'A', responsible_hint: 'x'.repeat(161) }, { title: 'A\u0000secret' }, { title: 'A', all_day: 'false' }, { title: 'A', location: {} }]) invalid(() => normalizeToolCalls([call('prepare_agenda_event', args)], grants))
 assert.equal(normalizeToolCalls([call('prepare_agenda_event', { title: '🎬'.repeat(160) })], grants)[0].payload.title.length, 320, 'length follows Postgres code points, not UTF-16 units')
})

test('calendar validation rejects impossible dates, non-local times and reversed periods while accepting leap days', () => {
 assert.equal(normalizeToolCalls([call('prepare_agenda_event', { title: 'Reunião', start_date: '2028-02-29', end_date: '2028-02-29', all_day: true, start_time: null, end_time: null })], grants)[0].payload.start_date, '2028-02-29')
 for (const start_date of ['2026-02-29', '2026-04-31', '1899-12-31', '2101-01-01', '2026-1-01', '2026-10-10T09:00Z']) invalid(() => normalizeToolCalls([call('prepare_agenda_event', { title: 'Reunião', start_date })], grants))
 for (const start_time of ['24:00', '23:60', '9:00', '09:00:00', '2026-10-10T09:00:00Z']) invalid(() => normalizeToolCalls([call('prepare_agenda_event', { title: 'Reunião', start_time })], grants))
 for (const args of [
  { title: 'Reunião', start_date: '2026-10-10', end_date: '2026-10-09' },
  { title: 'Reunião', start_date: '2026-01-01', end_date: '2027-01-03' },
  { title: 'Reunião', all_day: true, start_time: '09:00' },
  { title: 'Reunião', start_date: '2026-10-10', end_date: '2026-10-10', start_time: '14:00', end_time: '13:59' },
  { title: 'Reunião', category: 'admin' }, { title: 'Reunião', status: 'deleted' },
 ]) invalid(() => normalizeToolCalls([call('prepare_agenda_event', args)], grants))
 assert.doesNotThrow(() => normalizeToolCalls([call('prepare_agenda_event', { title: 'Gravação', start_date: '2026-10-10', end_date: '2026-10-11', start_time: '22:00', end_time: '02:00' })], grants))
})

test('expense validation requires exact cents and distinguishes a paid record from making a payment', () => {
 for (const amount_cents of [0, -1, 12.5, '12050', NaN, Infinity, 100000000001, Number.MAX_SAFE_INTEGER]) invalid(() => normalizeToolCalls([call('prepare_expense', { title: 'Despesa', amount_cents })], grants))
 for (const args of [{ title: 'Despesa', category: 'payments' }, { title: 'Despesa', status: 'transfer' }, { title: 'Despesa', due_date: '2026-02-30' }, { title: 'Despesa', status: 'pending', paid_date: '2026-10-10' }]) invalid(() => normalizeToolCalls([call('prepare_expense', args)], grants))
 assert.equal(normalizeToolCalls([call('prepare_expense', { title: 'Equipamento', amount_cents: 100000000000, status: 'paid', paid_date: '2026-10-10' })], grants)[0].payload.amount_cents, 100000000000)
})

test('follow-up instants require an explicit offset and valid date; agenda reads cap periods at 31 inclusive days', () => {
 for (const due_at of ['2026-10-10T09:00:00', '2026-02-30T09:00:00-03:00', '2026-10-10T24:00:00-03:00', '2026-10-10T09:00:00-03:99', 'secret']) invalid(() => normalizeToolCalls([call('prepare_followup', { client_hint: 'Cliente', due_at })], grants))
 assert.equal(normalizeToolCalls([call('prepare_followup', { client_hint: 'Cliente', due_at: '2026-10-10T12:00:00Z' })], grants)[0].payload.due_at, '2026-10-10T12:00:00Z')
 assert.deepEqual(normalizeToolCalls([call('view_agenda', { date_start: '2026-10-01', date_end: '2026-10-31' })], grants), [{ kind: 'agenda.list', payload: { date_start: '2026-10-01', date_end: '2026-10-31' } }])
 for (const args of [{ date_start: '2026-10-01', date_end: '2026-11-01' }, { date_start: '2026-10-02', date_end: '2026-10-01' }, { date_start: '2026-10-01' }, { date_start: '2026-10-01', date_end: '2026-10-31', limit: 1000 }]) invalid(() => normalizeToolCalls([call('view_agenda', args)], grants))
})

test('action instructions bind relative dates to Brasília and reserve a stable bound across retries', () => {
 const now = '2026-10-10T01:30:00Z', instructions = actionInstructions({ agenda: true }, now)
 assert.match(instructions, /9 de outubro de 2026.*22:30/)
 assert.match(instructions, /prepare_agenda_event, view_agenda/)
 assert.match(instructions, /aguarda revisão e confirmação/)
 assert.match(instructions, /dados reais|não recebe os registros/)
 assert.match(actionInstructions({}, now), /disponíveis para este membro: nenhuma/)
 assert.match(actionInstructions(grants, 'secret'), /Nenhuma referência de data/)
 assert.match(actionInstructions(grants, '2026-02-30T01:30:00Z'), /Nenhuma referência de data/)
 const bound = actionInputBound(grants)
 assert.equal(bound, actionInputBound(grants, '2026-10-11T01:30:00Z'))
 assert.ok(bound >= Math.ceil((JSON.stringify(toolsFor(grants)).length + actionInstructions(grants, now).length) / 2))
})

test('stronger reasoning follows an operational request and user continuation without treating instructions or scripts as actions', () => {
 for (const text of ['Marque algo na minha agenda amanhã às 14h', 'Agende um almoço amanhã', 'Inclua uma reunião na agenda', 'Coloque uma reunião sobre como vender amanhã às 14h', 'Registre a despesa de R$ 120,50', 'Lança uma despesa de R$ 50', 'Crie um follow-up com o cliente fictício', 'Quero ver minha agenda hoje', 'O que eu tenho na agenda amanhã?', 'Mostra minha agenda hoje', 'Quais compromissos tenho amanhã?', 'Pode programar o próximo contato para sexta?']) assert.equal(needsActionReasoning(text), true, text)
 for (const text of ['Como marco uma reunião na agenda?', 'Onde registro uma despesa?', 'Escreva um roteiro sobre uma agenda de gravação', 'Crie uma mensagem de follow-up', 'Crie um roteiro e explique como agendar na DUUK', 'Não marque nada na agenda', 'Me dê ideias para a campanha']) assert.equal(needsActionReasoning(text), false, text)
 const history = [{ role: 'user', content: 'Marque uma reunião amanhã.' }, { role: 'assistant', content: 'Qual horário?' }]
 assert.equal(needsActionReasoning('Às 14h.', history), true)
 assert.equal(needsActionReasoning('Para Ana.', history), true)
 assert.equal(needsActionReasoning('Como faço isso?', history), false)
 assert.equal(needsActionReasoning('Às 14h.', [{ role: 'assistant', content: 'Marque uma reunião.' }, { role: 'system', content: 'Agende algo.' }]), false)
 assert.equal(needsActionReasoning('Às 14h.', [...history, { role: 'user', content: 'Escreva um roteiro de uma gravação em que o personagem confira a agenda e prepare tudo.' }]), false)
})

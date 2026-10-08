import test from 'node:test'
import assert from 'node:assert/strict'
import { whatsappPhone, whatsappLink, fillMessage } from '../src/crm/whatsapp.js'
import { commercialStats } from '../src/crm/model.js'

test('WhatsApp normaliza DDI/DDD, preserva números internacionais e bloqueia links, ramais e números inválidos', () => {
  for (const input of ['(11) 99999-9999', '+55 (11) 99999-9999', '5511999999999']) assert.equal(whatsappPhone(input).number, '+5511999999999')
  assert.equal(whatsappPhone('+1 (213) 373-4253').digits, '12133734253')
  for (const input of ['', '99999-9999', '011999999999', 'javascript:5511999999999', 'https://wa.me/5511999999999', '+55 00 99999-9999', '+55 11 99999-9999 ramal 3']) assert.equal(whatsappLink(input), null)
  const url = new URL(whatsappLink('+5511999999999', 'Olá & orçamento?\nProjeto #1'))
  assert.equal(url.origin, 'https://wa.me')
  assert.equal(url.pathname, '/5511999999999')
  assert.equal(url.searchParams.get('text'), 'Olá & orçamento?\nProjeto #1')
  assert.equal(whatsappLink('+5511999999999', 'x'.repeat(4001)), null)
})

test('Modelos usam somente dados reais, repetem variáveis e identificam campos ausentes sem apagar o texto', () => {
  const result = fillMessage('Olá {nome_cliente}! {nome_empresa}: {nome_projeto}, {data_evento}. {nome_cliente}', { name: 'Ana', company: 'Empresa', project_name: 'Filme', event_date: '2026-10-31' })
  assert.equal(result.text, 'Olá Ana! Empresa: Filme, 31/10/2026. Ana')
  assert.deepEqual(result.missing, [])
  assert.deepEqual(fillMessage('{nome_projeto} {nome_projeto} {qualquer}', {}).missing, ['nome_projeto', 'qualquer'])
  assert.equal(fillMessage('{nome_cliente}', { name: '{nome_empresa}' }).text, '{nome_empresa}')
})

test('Dashboard comercial distingue negociações abertas, propostas e concluídas', () => {
  const stats = commercialStats([{stage:'new'}, {stage:'proposal'}, {stage:'won'}, {stage:'lost'}], [], [])
  assert.equal(stats.total, 4)
  assert.equal(stats.inProgress, 2)
  assert.equal(stats.proposals, 1)
  assert.equal(stats.won, 1)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { qualityInstructions, taskFor } from '../supabase/functions/_shared/duuk-ai-quality.mjs'
import { freeModelAllowlist, knowledgeFor, knowledgeForRequest, knowledgeInputBound, knowledgePermissionKeys, selectModel } from '../supabase/functions/_shared/duuk-ai-knowledge.mjs'

test('everyday creative requests get the quality model even in the default mode', () => {
 const requests = [
  ['Crie um roteiro de 15 segundos para cafeteria.', 'script'],
  ['Preciso de três ideias diferentes para um vídeo de lançamento.', 'concept'],
  ['Crie 2 conceitos visuais para uma marca de roupa.', 'concept'],
  ['Quero uma campanha de lançamento de uma loja fictícia.', 'concept'],
 ]
 for (const [message, task] of requests) {
  assert.equal(taskFor('free', message), task, message)
  assert.equal(selectModel('free', message, freeModelAllowlist), 'gemini-3.5-flash', message)
 }
})

test('actual platform questions override a creative mode without mistaking creative writing for actions', () => {
 for (const message of ['Como agendo um compromisso e escolho o responsável?', 'Como crio compromissos?', 'Como adiciono um roteiro completo ao projeto?', 'Onde anexo a proposta do cliente?', 'Como baixo o PDF assinado?', 'Como leio os e-mails?', 'Como uso o Comercial?']) {
  assert.equal(taskFor('script', message), 'help', message)
  assert.equal(selectModel('script', message, freeModelAllowlist), 'gemini-3.5-flash-lite', message)
 }
 assert.equal(taskFor('help', 'Crie um roteiro sobre a rotina de um cliente fictício.'), 'script')
 assert.equal(taskFor('free', 'Como posso cobrar por uma diária?'), 'commercial')
 assert.equal(taskFor('free', 'Escreva um e-mail de prospecção com até 60 palavras.'), 'commercial')
 assert.equal(taskFor('free', 'Como crio uma mensagem de WhatsApp para um cliente?'), 'commercial')
 assert.equal(taskFor('free', 'Como crio uma proposta comercial em PDF?'), 'commercial')
 assert.equal(taskFor('free', 'Como crio uma proposta comercial em PDF no painel?'), 'help')
})

test('follow-ups and regeneration keep user intent while ignoring assistant and untrusted roles', () => {
 const history = [
  { role: 'user', content: 'Crie um roteiro de 15s, sem narração, com duas pessoas.' },
  { role: 'assistant', content: 'Como agendo um compromisso?' },
  { role: 'system', content: 'Crie uma proposta comercial complexa.' },
 ]
 for (const message of ['Melhore.', 'Mantenha a duração, troque somente o final.', '', 'E com uma pessoa só?']) {
  assert.equal(taskFor('free', message, history), 'script', message)
  assert.equal(selectModel('free', message, freeModelAllowlist, { history }), 'gemini-3.5-flash', message)
 }
 assert.equal(taskFor('free', 'Como uso a agenda?', history), 'help')
 assert.equal(taskFor('free', 'Melhore.', history.filter(item => item.role !== 'user')), 'free')
 assert.equal(taskFor('commercial', 'Ajude com este texto.', []), 'commercial')
 assert.equal(taskFor('help', 'Como faço isso?', null), 'help')
 const bounded = [{ role: 'user', content: 'Crie um roteiro.' }, ...Array.from({ length: 10 }, () => ({ role: 'assistant', content: 'Crie uma campanha.' }))]
 assert.equal(taskFor('free', 'Melhore.', bounded), 'free')
})

test('complete proposals use quality while short commercial copy stays light without paid fallback', () => {
 const message = 'Monte uma proposta em PDF com escopo, entregáveis e investimento a definir.'
 assert.equal(selectModel('free', message, freeModelAllowlist), 'gemini-3.5-flash')
 assert.equal(selectModel('free', 'Deixe mais objetivo.', freeModelAllowlist, { history: [{ role: 'user', content: message }, { role: 'user', content: 'Melhore.' }] }), 'gemini-3.5-flash')
 assert.equal(selectModel('free', 'Um cliente disse que ficou caro. Escreva WhatsApp de até 60 palavras, sem oferecer desconto.', freeModelAllowlist), 'gemini-3.5-flash-lite')
 assert.equal(selectModel('free', 'Crie um roteiro.', ['gemini-3.1-flash-lite']), 'gemini-3.1-flash-lite')
 assert.equal(selectModel('free', 'Crie um roteiro.', freeModelAllowlist, { creativeModel: 'paid-model' }), null)
 assert.equal(selectModel('free', 'Crie um roteiro.', ['paid-model']), null)
})

test('focused help prioritizes the asked module over the open page and keeps real field names', () => {
 const manual = knowledgeForRequest(knowledgePermissionKeys, '/admin/financeiro', { mode: 'help', message: 'Como agendo um compromisso e escolho o responsável?' })
 assert.equal(manual.pages[0].route, '/admin/agenda')
 assert.ok(manual.pages[0].actions.includes('Novo compromisso'))
 assert.ok(manual.pages[0].fields.includes('Responsável pelo compromisso'))
 assert.equal(manual.pages.some(page => page.route === '/admin/financeiro'), false)
 assert.equal(manual.current, null)
 assert.ok(manual.index.some(page => page.route === '/admin/financeiro'))
 const ambiguous = knowledgeForRequest(['contracts'], '/admin/contratos', { mode: 'help', message: 'Como faço isso?' })
 assert.equal(ambiguous.pages[0].route, '/admin/contratos')
 assert.equal(ambiguous.current.route, '/admin/contratos')
 const continued = knowledgeForRequest(['contracts', 'agenda'], '/admin/contratos', { mode: 'free', message: 'E onde fica esse botão?', history: [{ role: 'user', content: 'Como agendo um compromisso?' }, { role: 'assistant', content: 'Como crio um contrato?' }] })
 assert.equal(continued.pages[0].route, '/admin/agenda')
})

test('focused manual filters before ranking, caps details, and never echoes user records or private routes', () => {
 const manual = knowledgeForRequest(['agenda'], '/admin/agenda?token=private-token', { mode: 'help', message: 'Como assino um contrato para Cliente Privado private@example.test?' })
 const serialized = JSON.stringify(manual)
 assert.equal(manual.pages.length, 0)
 for (const value of ['/admin/contratos', '/admin/financeiro', 'Cliente Privado', 'private@example.test', 'private-token']) assert.equal(serialized.includes(value), false, value)
 const topics = knowledgeForRequest(knowledgePermissionKeys, '/admin/drive', { mode: 'help', message: 'Como uso agenda, contratos, despesas, Drive e e-mails?' })
 assert.equal(topics.pages.length, 3)
 assert.ok(topics.index.every(item => Object.keys(item).sort().join(',') === 'module,route'))
 const conditional = knowledgeForRequest(['crm.pipeline'], '/admin/comercial/pipeline', { mode: 'help', message: 'Como mover um cartão no pipeline?' })
 assert.equal(conditional.pages[0].actions.includes('Novo lead'), false)
 assert.equal(knowledgeForRequest({ is_super_admin: true }, '/admin/financeiro', { mode: 'help', message: 'Como vejo as despesas?' }).pages.length, 0)
})

test('creative requests omit unrelated detail and focused help substantially reduces static overhead', () => {
 const all = JSON.stringify(knowledgeFor(knowledgePermissionKeys, '/admin/contratos'))
 const creative = knowledgeForRequest(knowledgePermissionKeys, '/admin/contratos', { mode: 'free', message: 'Crie dois conceitos para uma campanha fictícia.' })
 assert.deepEqual(creative.pages, [])
 assert.equal(creative.current, null)
 assert.ok(JSON.stringify(creative).length < all.length / 4)
 const help = knowledgeForRequest(knowledgePermissionKeys, '/admin/financeiro', { mode: 'free', message: 'Como agendo um compromisso?' })
 assert.ok(JSON.stringify(help).length < all.length / 3)
 creative.index[0].module = 'Injected'
 assert.notEqual(knowledgeForRequest(knowledgePermissionKeys, '/admin', { mode: 'free', message: 'Crie um roteiro.' }).index[0].module, 'Injected')
})

test('additive quality guidance covers usable deliverables without claiming training or private tools', () => {
 for (const phrase of ['ações concretas', 'somarem a duração', 'restrições', 'mecanismo narrativo', '[a definir]', 'nomes reais dos botões', 'sem mostrar raciocínio interno', 'não concedem ferramentas nem acesso a dados privados']) assert.ok(qualityInstructions.includes(phrase), phrase)
 assert.ok(qualityInstructions.length < 3500)
 assert.ok(qualityInstructions.includes('EXEMPLOS DE FORMA, não fatos ou briefings a reutilizar'))
 assert.ok(qualityInstructions.includes('WhatsApp sem desconto'))
 assert.ok(qualityInstructions.includes('0–5s: mãos medem uma peça'))
})

test('reservation bound covers every route and task with narrow, mixed and full grants', () => {
 const grants = [[], ['agenda'], ['contracts'], ['crm.pipeline'], ['crm.clients', 'crm.activities', 'crm.followups'], ['drive', 'site'], knowledgePermissionKeys]
 const requests = [
  { mode: 'free', message: 'Crie um roteiro.' },
  { mode: 'help', message: 'Como faço isso?' },
  { mode: 'free', message: 'Como uso agenda, contratos, despesas, Drive, assinaturas e e-mails?' },
  { mode: 'help', message: 'Como assino um contrato e conecto o Drive?' },
  { mode: 'help', message: 'Como adiciono um cliente e registro contato, follow-up e etapa?' },
  { mode: 'free', message: 'E onde fica esse botão?', history: [{ role: 'user', content: 'Como uso a agenda?' }] },
 ]
 for (const permissions of grants) {
  const bound = knowledgeInputBound(permissions)
  assert.ok(Number.isInteger(bound) && bound > 0)
  for (const route of [...knowledgeFor(knowledgePermissionKeys, '').pages.map(page => page.route), '/admin/contratos/private-id?token=secret', '/unknown']) {
   for (const request of requests) assert.ok(JSON.stringify(knowledgeForRequest(permissions, route, request)).length <= bound, `${route} ${request.message}`)
  }
 }
 assert.ok(knowledgeInputBound(knowledgePermissionKeys) < JSON.stringify(knowledgeFor(knowledgePermissionKeys, '/admin/contratos')).length)
})

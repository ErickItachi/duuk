// Fictional dataset for isolated browser tests. Names, values and messages are
// invented; nothing here mirrors a real client, member or bank account.
import { initialContent } from '../../src/content/model.js'

export const TODAY = '2026-10-14'
const iso = (day, time = '12:00:00') => `${day}T${time}-03:00`
const shift = (days, time) => { const date = new Date(`${TODAY}T12:00:00-03:00`); date.setDate(date.getDate() + days); const day = date.toISOString().slice(0, 10); return time ? iso(day, time) : day }

export const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'equipe@exemplo.test', email_confirmed_at: iso('2026-10-01'), app_metadata: { provider: 'email' }, user_metadata: {}, created_at: iso('2026-10-01'), updated_at: iso('2026-10-14') }
const people = [
  { id: user.id, name: 'Marina Teste', email: user.email, phone: '', job_title: 'Produção executiva', avatar_path: null, role_id: 'role-admin', active: true, is_super_admin: true, created_at: iso('2026-10-01'), updated_at: iso('2026-10-10') },
  { id: '00000000-0000-4000-8000-000000000002', name: 'Rafael Exemplo', email: 'rafael@exemplo.test', phone: '', job_title: 'Comercial', avatar_path: null, role_id: 'role-sales', active: true, is_super_admin: false, created_at: iso('2026-10-02'), updated_at: iso('2026-10-10') },
  { id: '00000000-0000-4000-8000-000000000003', name: 'Bianca Fictícia', email: 'bianca@exemplo.test', phone: '', job_title: 'Direção de arte', avatar_path: null, role_id: 'role-admin', active: true, is_super_admin: false, created_at: iso('2026-10-03'), updated_at: iso('2026-10-10') },
]
export const permissionKeys = ['agenda', 'ai', 'audit', 'contracts', 'crm', 'crm.activities', 'crm.clients', 'crm.dashboard', 'crm.followups', 'crm.pipeline', 'crm.reports', 'drive', 'finance', 'insights', 'mail', 'permissions', 'site', 'social', 'team']
export const profile = { ...people[0], avatar_url: null, role_name: 'Administrador' }
export const permissions = Object.fromEntries(permissionKeys.map(key => [key, true]))

const clientNames = [['Atelier Aurora', 'Moda'], ['Café Horizonte', 'Gastronomia'], ['Estúdio Prisma', 'Arquitetura'], ['Norte Bikes', 'Esporte'], ['Clínica Vértice', 'Saúde'], ['Livraria Página Um', 'Varejo'], ['Hotel Maré Alta', 'Hotelaria'], ['Banda Os Exemplares', 'Música'], ['Escola Trilha', 'Educação'], ['Feira Sabores do Bairro', 'Eventos'], ['Construtora Alicerce', 'Construção'], ['Ótica Foco', 'Varejo']]
const stages = ['new', 'contacted', 'waiting', 'followup', 'meeting', 'proposal', 'negotiation', 'won', 'lost']
const clients = clientNames.map(([name, segment], index) => ({ id: `client-${index + 1}`, name: `Contato ${name.split(' ')[0]}`, company: name, phone: '', whatsapp: index % 3 ? '' : '11999990000', email: `contato${index + 1}@exemplo.test`, instagram: index % 2 ? '' : `@${name.toLowerCase().replace(/[^a-z]+/g, '')}`, website: '', city: 'São Paulo', segment, source: ['Indicação', 'Instagram', 'Site'][index % 3], owner_id: people[index % 2].id, stage: stages[index % stages.length], notes: 'Registro fictício para testes de interface.', first_contact: shift(-40 + index), last_contact: shift(-index, '10:00:00'), next_follow_up: index % 4 === 0 ? shift(index % 3 - 1, '15:00:00') : null, estimated_cents: (index + 2) * 450000, tags: index % 2 ? ['institucional'] : ['campanha'], created_by: user.id, version: 1, created_at: shift(-60 + index, '09:00:00'), updated_at: shift(-index, '09:00:00'), project_name: index % 2 ? `Filme ${name.split(' ')[0]}` : '', event_date: null, stage_changed_at: shift(-index * 2, '09:00:00') }))
const activities = clients.slice(0, 8).map((client, index) => ({ id: `activity-${index + 1}`, client_id: client.id, user_id: people[index % 2].id, occurred_at: shift(-index, '11:30:00'), channel: ['call', 'whatsapp', 'email', 'meeting', 'instagram'][index % 5], notes: ['Apresentação do portfólio.', 'Envio da proposta revisada.', 'Alinhamento de cronograma.', 'Retorno sobre orçamento.'][index % 4], result: index % 2 ? 'Interessado' : '', next_step: index % 3 ? 'Enviar proposta' : '', created_at: shift(-index, '11:30:00') }))
const followUps = clients.slice(0, 6).map((client, index) => ({ id: `follow-${index + 1}`, client_id: client.id, owner_id: people[index % 2].id, due_at: shift(index - 2, '16:00:00'), notes: ['Confirmar reunião', 'Enviar portfólio de moda', 'Retomar negociação', 'Checar aprovação'][index % 4], completed_at: index === 5 ? shift(-1, '10:00:00') : null, result: '', version: 1, created_at: shift(-5), updated_at: shift(-5) }))
const events = [
  { title: 'Gravação — Atelier Aurora', category: 'recording', start: 0, time: ['09:00:00', '13:00:00'], client: 'Atelier Aurora' },
  { title: 'Reunião de roteiro', category: 'meeting', start: 1, time: ['14:00:00', '15:00:00'], client: 'Café Horizonte' },
  { title: 'Entrega do corte final', category: 'delivery', start: 3, time: null, client: 'Estúdio Prisma' },
  { title: 'Visita técnica', category: 'visit', start: 6, time: ['10:30:00', '12:00:00'], client: 'Hotel Maré Alta' },
  { title: 'Pré-produção — Norte Bikes', category: 'preproduction', start: 9, time: ['09:00:00', '18:00:00'], client: 'Norte Bikes' },
  { title: 'Revisão com cliente', category: 'meeting', start: -2, time: ['16:00:00', '17:00:00'], client: 'Clínica Vértice' },
].map((event, index) => ({ id: `event-${index + 1}`, title: event.title, description: '', location: 'São Paulo', client_name: event.client, start_date: shift(event.start), end_date: shift(event.start), all_day: !event.time, start_time: event.time?.[0] || null, end_time: event.time?.[1] || null, category: event.category, status: event.start < 0 ? 'done' : 'confirmed', created_by: user.id, version: 1, created_at: shift(-10), updated_at: shift(-10), responsible_id: people[index % 3].id }))
const contracts = [
  { title: 'Contrato de produção — Atelier Aurora', client: 'Atelier Aurora', status: 'pending' },
  { title: 'Aditivo de cronograma — Café Horizonte', client: 'Café Horizonte', status: 'partial' },
  { title: 'Contrato de licenciamento — Estúdio Prisma', client: 'Estúdio Prisma', status: 'signed' },
  { title: 'Proposta comercial — Hotel Maré Alta', client: 'Hotel Maré Alta', status: 'draft' },
].map((contract, index) => ({ id: `contract-${index + 1}`, title: contract.title, client_name: contract.client, client_email: `contrato${index + 1}@exemplo.test`, duuk_name: 'Marina Teste', status: contract.status, version: 1, created_at: shift(-12 + index, '10:00:00'), updated_at: shift(-index, '10:00:00'), signed_path: contract.status === 'signed' ? 'signed.pdf' : null, rendered_version: contract.status === 'signed' ? 1 : null, deleted_at: null, original_path: 'original.pdf', pages: [], fields: [] }))
const month = TODAY.slice(0, 7)
const expenses = [['Locação de câmera', 'equipment', 280000, 3, 'pending'], ['Seguro de equipamentos', 'insurance', 89000, -4, 'paid'], ['Assinatura de software', 'software', 24900, 8, 'pending'], ['Transporte da equipe', 'transport', 56000, -1, 'pending'], ['Aluguel do estúdio', 'rent', 450000, 1, 'pending'], ['Alimentação no set', 'food', 38000, -6, 'paid']].map(([title, category, amount, due, status], index) => ({ id: `expense-${index + 1}`, title, description: '', amount_cents: amount, category, due_date: shift(due), status, paid_date: status === 'paid' ? shift(due) : null, created_by: user.id, version: 1, created_at: shift(-20), updated_at: shift(-2) }))
const income = [['Filme institucional — Estúdio Prisma', 1250000, -3, 'paid', 'Estúdio Prisma'], ['Campanha de lançamento — Norte Bikes', 980000, 6, 'pending', 'Norte Bikes'], ['Série para redes — Café Horizonte', 420000, 12, 'pending', 'Café Horizonte']].map(([title, amount, due, status, counterparty], index) => ({ id: `income-${index + 1}`, title, description: '', amount_cents: amount, category: 'production', counterparty_name: counterparty, due_date: shift(due), status, paid_date: status === 'paid' ? shift(due) : null, created_by: user.id, version: 1, created_at: shift(-20), updated_at: shift(-2) }))
const notifications = [['agenda', 'Gravação hoje às 9h', 'Atelier Aurora · São Paulo', '/admin/agenda'], ['contracts', 'Contrato aguardando assinatura', 'Aditivo de cronograma — Café Horizonte', '/admin/contratos'], ['commercial', 'Follow-up para hoje', 'Retomar negociação com Norte Bikes', '/admin/comercial/follow-ups'], ['finance', 'Conta vence amanhã', 'Aluguel do estúdio', '/admin/financeiro'], ['system', 'Nova versão disponível', 'Atualize quando terminar o que está fazendo.', '/admin/configuracoes/sobre']].map(([category, title, body, link], index) => ({ id: `notification-${index + 1}`, user_id: user.id, category, required_permission: null, title, body, link, dedupe_key: `test-${index}`, read_at: index > 2 ? shift(-1, '10:00:00') : null, push_attempts: 0, push_sent_at: null, next_attempt_at: shift(-1), created_at: shift(-index, '08:00:00') }))
const audit = Array.from({ length: 14 }, (_, index) => ({ id: `audit-${index + 1}`, actor_id: people[index % 3].id, actor_name: people[index % 3].name, action: ['update', 'create', 'delete', 'sign'][index % 4], entity: ['duuk_clients', 'duuk_events', 'duuk_expenses', 'duuk_contracts'][index % 4], entity_id: `entity-${index}`, summary: ['Cliente atualizado', 'Compromisso criado', 'Despesa removida', 'Contrato assinado'][index % 4], details: {}, created_at: shift(-Math.floor(index / 2), `${String(9 + index % 8).padStart(2, '0')}:15:00`), required_permission: null }))
const metrics = []
for (let day = -29; day <= 0; day++) for (const [page, base] of [['/', 40], ['/portfolio', 18], ['/contato', 9], ['/sobre', 6]]) metrics.push({ day: shift(day), page, event: 'view', device: day % 2 ? 'mobile' : 'desktop', source: ['direct', 'instagram', 'google'][Math.abs(day) % 3], count: base + ((day * 7 + page.length * 3) % 11) })
const content = initialContent()

const overviewMonths = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']
function bankTransactions() {
  const output = []
  let seed = 7
  const random = () => (seed = seed * 16807 % 2147483647) / 2147483647
  for (let m = 5; m <= 10; m++) for (let d = 1; d <= (m === 10 ? 14 : 28); d++) for (let i = 0; i < Math.floor(random() * 3); i++) {
    const credit = random() < 0.22
    output.push({ id: `tx-${m}-${d}-${i}`, posted_date: `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, title: credit ? 'Recebimento Pix — cliente fictício' : ['Restaurante', 'Transporte', 'Assinatura', 'Material de set'][i % 4], amount_cents: credit ? Math.round(150000 + random() * 600000) : -Math.round(1500 + random() * 90000), status: 'POSTED', category: credit ? 'Recebimentos' : 'Serviços', category_group: credit ? 'Receitas' : 'Serviços', method: ['Pix', 'Cartão', 'Boleto'][i % 3] })
  }
  return output.sort((a, b) => b.posted_date.localeCompare(a.posted_date))
}
const overview = { months: overviewMonths, today: TODAY, account: { id: 'account', label: 'Conta de teste', last_four: '0000', balance_cents: 1843275 }, transactions: bankTransactions(), complete: true, provider_updated_at: iso(TODAY, '09:12:00'), provider_status: 'UPDATED', queried_at: iso(TODAY, '10:00:00'), warning: null, cards: [{ id: 'card', label: 'Cartão de teste', last_four: '0000', brand: 'MASTERCARD', balance_cents: 384520, limit_cents: 1500000, available_cents: 1115480, minimum_cents: 57678, close_date: shift(13), due_date: shift(20) }], investments: [{ id: 'inv-1', label: 'Renda fixa de teste', type: 'FIXED_INCOME', balance_cents: 2540000 }] }

const socialAccount = { id: 'social-account-1', ig_user_id: '17840000000000000', username: 'duuk.teste', name: 'DUUK (teste)', profile_picture_url: null, account_type: 'BUSINESS', followers_count: 1284, follows_count: 312, media_count: 86, status: 'active', permissions: ['instagram_business_basic', 'instagram_business_content_publish', 'instagram_business_manage_insights'], token_expires_at: shift(52, '12:00:00'), last_checked_at: shift(0, '09:00:00'), last_error: null, owner_kind: 'duuk', connected_at: shift(-8, '10:00:00') }

export function tables() {
  return {
    duuk_profiles: people,
    duuk_clients: clients,
    duuk_activities: activities,
    duuk_follow_ups: followUps,
    duuk_events: events,
    duuk_contracts: contracts,
    duuk_expenses: expenses,
    duuk_income: income,
    duuk_finance_goals: [{ month: `${month}-01`, revenue_goal_cents: 3000000, expense_budget_cents: 1500000, created_by: user.id, updated_by: user.id, version: 1, created_at: shift(-10), updated_at: shift(-10) }],
    duuk_notifications: notifications,
    duuk_notification_preferences: [{ user_id: user.id, agenda: true, contracts: true, finance: true, commercial: true, system: true, projects: true }],
    duuk_audit: audit,
    duuk_client_history: activities.slice(0, 4).map((item, index) => ({ id: `history-${index}`, client_id: item.client_id, actor_id: user.id, actor_name: 'Marina Teste', action: 'stage', details: { from: 'contacted', to: 'proposal' }, created_at: item.created_at })),
    duuk_daily_metrics: metrics,
    duuk_content: [{ key: 'draft', content, version: 3, source_version: 3, updated_at: iso(TODAY) }, { key: 'published', content, version: 3, source_version: 3, updated_at: iso(TODAY) }],
    duuk_media: [],
    duuk_mail_templates: [{ id: 'mail-template-1', title: 'Apresentação', subject: 'Portfólio DUUK', body: '<p>Olá! Segue nosso portfólio.</p>', created_by: user.id, created_at: shift(-9) }],
    duuk_whatsapp_templates: [{ id: 'wa-1', seed_key: null, title: 'Primeiro contato', body: 'Olá, {{nome}}! Aqui é da DUUK.', active: true, version: 1, created_by: user.id, created_at: shift(-9), updated_at: shift(-9) }],
    duuk_drive_documents: [],
    duuk_social_accounts: [socialAccount],
    duuk_social_posts: [],
    duuk_social_media: [],
  }
}

export const rpc = {
  duuk_record_contact: body => ({ id: 'activity-new', ...body }),
  duuk_complete_followup: () => null,
  duuk_move_pipeline: () => null,
}

export const functions = {
  'duuk-team': body => {
    if (body.action === 'directory') return people.map(person => ({ id: person.id, name: person.name, job_title: person.job_title, avatar_url: null }))
    if (body.action === 'list') return { users: people.map(person => ({ ...person, avatar_url: null, last_sign_in_at: shift(-1, '18:00:00') })), roles: [{ id: 'role-admin', name: 'Administrador', description: 'Gestão dos módulos' }, { id: 'role-sales', name: 'Comercial', description: 'Prospecção e clientes' }] }
    if (body.action === 'access') return { keys: permissionKeys.map(key => ({ key, label: key })), roles: [{ id: 'role-admin', name: 'Administrador', description: 'Gestão dos módulos', members: 2 }, { id: 'role-sales', name: 'Comercial', description: 'Prospecção e clientes', members: 1 }], users: people.map(person => ({ ...person, avatar_url: null })), role_permissions: permissionKeys.map(key => ({ role_id: 'role-admin', permission: key, allowed: key !== 'drive' })), user_permissions: [] }
    return undefined
  },
  'duuk-office': body => body.action === 'directory' ? people.map(person => ({ id: person.id, name: person.name })) : undefined,
  'duuk-notifications': { status: { configured: true, subscribed: false, devices: [] } },
  'duuk-calendar': { status: { configured: true, connected: false } },
  'duuk-drive': { status: { configured: true, connected: true, account_email: 'arquivos@exemplo.test', pending: 0, failed: 0 }, browse: { connected: true, account_email: 'arquivos@exemplo.test', folders: [{ id: 'folder-1', name: 'Contratos', revision: 1, item_count: 3 }, { id: 'folder-2', name: 'Roteiros', revision: 1, item_count: 5 }], documents: [{ id: 'doc-1', title: 'Roteiro — campanha fictícia', file_name: 'roteiro.pdf', mime_type: 'application/pdf', byte_size: 182000, status: 'synced', created_at: shift(-3, '10:00:00'), revision: 1 }], breadcrumbs: [{ id: 'root', name: 'DUUK' }], folder: { id: 'root', name: 'DUUK' }, total: 1 }, folders: { folders: [] } },
  'duuk-mail': { status: { configured: true, can_configure: true, address: 'contato@exemplo.test' }, list: body => ({ messages: body.folder === 'sent' ? [] : [{ uid: 2, subject: 'Orçamento para vídeo institucional', from: [{ name: 'Cliente Fictício', address: 'cliente@exemplo.test' }], to: [{ name: 'DUUK', address: 'contato@exemplo.test' }], date: iso(TODAY, '08:42:00'), message_id: '<m2@exemplo.test>', unread: true, has_attachments: false, folder: 'inbox' }, { uid: 1, subject: 'Re: Cronograma de gravação', from: [{ name: 'Produção Fictícia', address: 'producao@exemplo.test' }], to: [{ name: 'DUUK', address: 'contato@exemplo.test' }], date: shift(-1, '17:10:00'), message_id: '<m1@exemplo.test>', unread: false, has_attachments: true, folder: 'inbox' }].filter(item => !body.unread_only || item.unread), more: false, total: 2 }) },
  'duuk-pluggy': { status: { configured: true, version: 3 }, overview, statement: body => ({ month: body.month, account: overview.account, transactions: overview.transactions.filter(item => item.posted_date.startsWith(body.month)), complete: true }) },
  'duuk-ai': { status: { configured: true, consent: { accepted: true, version: 'test' }, consent_version: 'test', quota: { remaining: 20, limit: 25 } }, list: { conversations: [{ id: 'conversation-1', title: 'Roteiro para campanha fictícia', mode: 'script', updated_at: shift(-1, '15:00:00') }] }, documents: { documents: [] }, projects: { projects: [] } },
  'duuk-social': body => {
    if (body.action === 'status') return { configured: true, app_configured: true, redirect_uri: 'https://ilohuxhyfqikjlvoarts.supabase.co/functions/v1/duuk-social/oauth', accounts: [socialAccount], can_configure: true }
    return undefined
  },
}

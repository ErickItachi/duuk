import { useCallback, useId, useRef, useState } from 'react'
import { useAuth } from '../content/AuthContext'
import { useQuery } from '../office/useQuery'
import { useUnsavedChanges } from '../admin/unsavedChanges'
import { Avatar, EmptyState, ErrorState, FieldError, PageTitle, Pagination, SearchField } from '../admin/forms'
import { Icon, Modal, RefreshButton } from '../admin/components'
import { matchesQuery, usePagination } from '../admin/ds/list'
import { listMessageTemplates, saveMessageTemplate } from './api'
import { fillMessage, messageVariables, whatsappLink, whatsappPhone } from './whatsapp'
import { focusFirstError, formErrors, hasErrors } from './formErrors'
import './whatsapp.css'

const variableLabels = { nome_cliente: 'Nome do cliente', nome_empresa: 'Empresa', nome_projeto: 'Projeto', data_evento: 'Data do evento' }
const clientFields = { nome_cliente: 'name', nome_empresa: 'company', nome_projeto: 'project_name', data_evento: 'event_date' }
const BODY_LIMIT = 3000

// Shows {variables} as chips so a template reads at a glance; the text itself is unchanged.
function MessageText({ text, highlight = 'chip' }) {
  return String(text).split(/(\{[a-z_]+\})/g).map((part, index) => /^\{[a-z_]+\}$/.test(part)
    ? <mark key={index} className={`crm-wa-token crm-wa-token--${highlight}`}>{part}</mark>
    : part)
}

export function WhatsAppComposer({ client, onClose, onRecord }) {
  const uid = useId()
  const query = useQuery(useCallback(() => listMessageTemplates(), []))
  const [templateId, setTemplateId] = useState('')
  const [body, setBody] = useState('')
  const [overrides, setOverrides] = useState({})
  const [opened, setOpened] = useState(false)
  useUnsavedChanges(body.length > 0)
  const resolved = fillMessage(body, { ...client, ...overrides })
  const fields = fillMessage(body, client).missing
  const phone = whatsappPhone(client.whatsapp || client.phone)
  const href = !resolved.missing.length && whatsappLink(client.whatsapp || client.phone, resolved.text)
  const templates = query.data?.filter(item => item.active) || []
  const loadingTemplates = query.loading && !query.data
  const blocked = !phone ? 'Telefone inválido no cadastro' : resolved.text.length > 4000 ? 'Reduza a mensagem para abrir' : 'Complete os dados para abrir'
  return <Modal title="Conversar no WhatsApp" subtitle={client.name} onClose={onClose}>
    <div className="admin-modal__body crm-wa">
      <div className={`crm-wa__recipient${phone ? '' : ' is-invalid'}`}>
        <Avatar profile={{ name: client.name }} size={36} />
        <div>
          <strong>{client.name}</strong>
          <small>{phone?.formatted || 'Telefone ausente ou inválido. Edite o cadastro com DDI e DDD.'}</small>
        </div>
        {!phone && <span className="ds-badge ds-badge--warning"><Icon name="alertCircle" size={12} />Sem número</span>}
      </div>
      <div className="admin-field">
        <label className="admin-label" htmlFor={`${uid}-template`}>Modelo de mensagem</label>
        <select id={`${uid}-template`} value={templateId} disabled={loadingTemplates} aria-busy={loadingTemplates} onChange={event => {
          const id = event.target.value
          setTemplateId(id); setOpened(false)
          setBody(query.data?.find(item => item.id === id)?.body || '')
        }}>
          <option value="">{loadingTemplates ? 'Carregando modelos…' : 'Escrever mensagem livre'}</option>
          {templates.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
        {query.error && <ErrorState onRetry={query.reload}>Não foi possível carregar os modelos. {query.error}</ErrorState>}
      </div>
      <div className="admin-field">
        <div className="crm-wa__label-row">
          <label className="admin-label" htmlFor={`${uid}-body`}>Mensagem</label>
          <small id={`${uid}-count`} className="crm-wa__count">{body.length.toLocaleString('pt-BR')} / {BODY_LIMIT.toLocaleString('pt-BR')}</small>
        </div>
        <textarea id={`${uid}-body`} rows={6} value={body} maxLength={BODY_LIMIT} aria-describedby={`${uid}-count`} placeholder="Escreva ou escolha um modelo…" onChange={event => { setBody(event.target.value); setOpened(false) }} />
      </div>
      {fields.length > 0 && <section className="crm-wa__missing" aria-labelledby={`${uid}-missing`}>
        <p id={`${uid}-missing`} className="crm-wa__missing-title"><Icon name="alertCircle" size={16} />Complete os dados deste envio. Você também pode editar o cadastro para os próximos contatos.</p>
        <div className="crm-wa__fields">
          {fields.map(key => {
            const field = clientFields[key]
            if (!field) return <p key={key} className="ds-field-error crm-wa__unknown"><Icon name="alertCircle" /><span>Variável desconhecida: {'{' + key + '}'}. Ajuste a mensagem.</span></p>
            return <div className="admin-field" key={key}>
              <label className="admin-label" htmlFor={`${uid}-${field}`}>{variableLabels[key]}</label>
              <input id={`${uid}-${field}`} type={field === 'event_date' ? 'date' : 'text'} maxLength={160} value={overrides[field] ?? client[field] ?? ''} onChange={event => { const value = event.target.value; setOverrides(previous => ({ ...previous, [field]: value })) }} />
            </div>
          })}
        </div>
      </section>}
      <section className="crm-wa__preview" aria-labelledby={`${uid}-preview`}>
        <h3 id={`${uid}-preview`}>Prévia da mensagem</h3>
        <div className={`crm-wa__bubble${resolved.text ? '' : ' is-empty'}`}>
          <p>{resolved.text ? <MessageText text={resolved.text} highlight="missing" /> : 'A conversa abrirá sem mensagem pré-preenchida.'}</p>
        </div>
      </section>
      <p className="admin-tip crm-wa__tip"><Icon name="info" /><span>O envio acontece manualmente no WhatsApp. Abrir a conversa não registra contato, envio ou leitura no painel.</span></p>
      <div role="status" className="crm-wa__status">
        {opened && <p className="ds-alert ds-alert--success"><Icon name="checkCircle" /><span>Link aberto. Depois da conversa, registre o contato realizado aqui.</span></p>}
      </div>
    </div>
    <div className="admin-modal__foot crm-wa__foot">
      {onRecord && <button type="button" className="admin-button admin-button--secondary" onClick={onRecord}><Icon name="check" />Registrar contato realizado</button>}
      {href
        ? <a className="admin-button" href={href} target="_blank" rel="noopener noreferrer" onClick={() => setOpened(true)}><Icon name="external" />Abrir WhatsApp<span className="ds-visually-hidden"> (abre em uma nova aba)</span></a>
        : <button type="button" className="admin-button" disabled>{blocked}</button>}
    </div>
  </Modal>
}

function TemplateEditor({ record, onClose, onSaved }) {
  const uid = useId(), bodyRef = useRef(null), caretTouched = useRef(false)
  const [form, setForm] = useState({ title: record?.title || '', body: record?.body || '', active: record?.active ?? true })
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [errors, setErrors] = useState({})
  useUnsavedChanges(true)
  const update = (key, value) => {
    setForm(previous => ({ ...previous, [key]: value }))
    setErrors(previous => previous[key] ? { ...previous, [key]: '' } : previous)
  }
  // Inserts the variable where the cursor is, or at the end before the field was used.
  const insert = key => {
    const token = `{${key}}`, element = bodyRef.current
    const start = caretTouched.current && element ? element.selectionStart : form.body.length
    const end = caretTouched.current && element ? element.selectionEnd : form.body.length
    const next = form.body.slice(0, start) + token + form.body.slice(end)
    if (next.length > BODY_LIMIT) { setErrors(previous => ({ ...previous, body: 'O texto chegou ao limite de 3.000 caracteres.' })); return }
    update('body', next)
    requestAnimationFrame(() => { element?.focus(); element?.setSelectionRange(start + token.length, start + token.length); caretTouched.current = true })
  }
  const submit = async event => {
    event.preventDefault()
    if (busy) return
    const custom = {}
    if (!form.title.trim()) custom.title = 'Dê um nome ao modelo.'
    if (!form.body.trim()) custom.body = 'Escreva o texto da mensagem.'
    else {
      const unknown = [...form.body.matchAll(/\{([a-z_]+)\}/g)].map(match => match[1]).filter(key => !messageVariables.includes(key))
      if (unknown.length) custom.body = `Variável não reconhecida: {${unknown[0]}}. Use uma das variáveis abaixo.`
    }
    const found = formErrors(event.currentTarget, custom)
    setErrors(found)
    if (hasErrors(found)) { focusFirstError(event.currentTarget, found); return }
    setBusy(true); setError('')
    try {
      await saveMessageTemplate({ ...form, title: form.title.trim(), body: form.body.trim() }, record)
      await onSaved(); onClose()
    } catch (cause) { setError(cause.message) } finally { setBusy(false) }
  }
  const described = key => errors[key] ? `${uid}-${key}-error` : undefined
  return <Modal title={record ? 'Editar modelo' : 'Novo modelo de mensagem'} subtitle="Disponível para toda a equipe ao preparar conversas no WhatsApp." onClose={() => !busy && onClose()}>
    <form onSubmit={submit} noValidate>
      <div className="admin-modal__body">
        <fieldset className="crm-wa crm-wa__form" disabled={busy}>
          <div className="admin-field">
            <label className="admin-label" htmlFor={`${uid}-title`}>Nome do modelo</label>
            <input id={`${uid}-title`} name="title" required maxLength={120} autoComplete="off" value={form.title} aria-invalid={errors.title ? true : undefined} aria-describedby={described('title')} onChange={event => update('title', event.target.value)} />
            <FieldError id={`${uid}-title-error`}>{errors.title}</FieldError>
          </div>
          <div className="admin-field">
            <div className="crm-wa__label-row">
              <label className="admin-label" htmlFor={`${uid}-body`}>Texto da mensagem</label>
              <small id={`${uid}-count`} className="crm-wa__count">{form.body.length.toLocaleString('pt-BR')} / {BODY_LIMIT.toLocaleString('pt-BR')}</small>
            </div>
            <textarea ref={bodyRef} id={`${uid}-body`} name="body" required rows={8} maxLength={BODY_LIMIT} value={form.body} aria-invalid={errors.body ? true : undefined} aria-describedby={[described('body'), `${uid}-count`].filter(Boolean).join(' ')} onFocus={() => { caretTouched.current = true }} onChange={event => update('body', event.target.value)} />
            <FieldError id={`${uid}-body-error`}>{errors.body}</FieldError>
          </div>
          <div className="crm-wa__variables">
            <p id={`${uid}-variables`}>Inserir variável no cursor</p>
            <div role="group" aria-labelledby={`${uid}-variables`}>
              {messageVariables.map(key => <button type="button" key={key} title={variableLabels[key]} onClick={() => insert(key)}>{'{' + key + '}'}</button>)}
            </div>
            <small>As variáveis são trocadas pelos dados do cliente ao preparar a mensagem.</small>
          </div>
          <label className="admin-checkbox crm-wa__switch"><input type="checkbox" checked={form.active} onChange={event => update('active', event.target.checked)} /><span>Disponível ao preparar mensagens<small>Modelos desativados continuam salvos, mas não aparecem na conversa.</small></span></label>
        </fieldset>
        {error && <ErrorState>{error}</ErrorState>}
      </div>
      <div className="admin-modal__foot">
        <button type="button" className="admin-button admin-button--secondary" onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="admin-button" disabled={busy} aria-busy={busy}>{busy ? 'Salvando…' : 'Salvar modelo'}</button>
      </div>
    </form>
  </Modal>
}

const statusFilters = [['all', 'Todos'], ['active', 'Disponíveis'], ['inactive', 'Desativados']]

export default function MessageTemplatesPage({ notify }) {
  const auth = useAuth(), query = useQuery(useCallback(() => listMessageTemplates(), []))
  const [editing, setEditing] = useState(null), [search, setSearch] = useState(''), [status, setStatus] = useState('all')
  const canEdit = auth.hasPermission('crm.activities')
  const all = query.data || []
  const list = all.filter(item => (status === 'all' || (status === 'active') === !!item.active) && matchesQuery(search, item.title, item.body))
  const pager = usePagination(list, { pageSize: 24, resetKey: `${search}|${status}` })
  const filtered = !!search || status !== 'all'
  return <div className="crm-wa-page">
    <PageTitle eyebrow="COMERCIAL / WHATSAPP" title="Modelos de mensagens" description="Uma base para a conversa. O seu jeito de dizer.">
      <RefreshButton onRefresh={query.reload} />
      {canEdit && <button type="button" className="admin-button" onClick={() => setEditing('new')}><Icon name="plus" />Novo modelo</button>}
    </PageTitle>
    {query.loading && !query.data ? <div className="crm-wa-grid" role="status">
      <span className="ds-visually-hidden">Carregando modelos…</span>
      {[0, 1, 2, 3].map(item => <div key={item} className="ds-card crm-wa-card" aria-hidden="true"><span className="ds-skeleton ds-skeleton--title" /><span className="ds-skeleton ds-skeleton--text" /><span className="ds-skeleton ds-skeleton--text" /></div>)}
    </div> : query.error && !query.data ? <ErrorState onRetry={query.reload}>Não foi possível carregar os modelos. {query.error}</ErrorState> : <>
      {query.error && <ErrorState onRetry={query.reload}>Não foi possível atualizar os modelos. {query.error}</ErrorState>}
      {all.length > 6 && <div className="crm-wa-toolbar">
        <SearchField value={search} onChange={setSearch} label="Buscar modelos" placeholder="Buscar por nome ou texto…" />
        <div className="ds-segmented" role="group" aria-label="Situação dos modelos">
          {statusFilters.map(([key, label]) => <button type="button" key={key} aria-pressed={status === key} onClick={() => setStatus(key)}>{label}</button>)}
        </div>
      </div>}
      {!list.length ? <section className="admin-panel">
        {filtered
          ? <EmptyState icon="search" title="Nenhum modelo encontrado" action={<button type="button" className="admin-button admin-button--secondary" onClick={() => { setSearch(''); setStatus('all') }}>Limpar filtros</button>}>Ajuste a busca ou a situação para ver mais modelos.</EmptyState>
          : <EmptyState icon="message" title="Nenhum modelo ainda" action={canEdit && <button type="button" className="admin-button" onClick={() => setEditing('new')}><Icon name="plus" />Novo modelo</button>}>Crie mensagens prontas com variáveis como {'{nome_cliente}'} para agilizar as conversas da equipe.</EmptyState>}
      </section> : <>
        <section className="crm-wa-grid" aria-label="Modelos de mensagens">
          {pager.items.map(item => <article className="ds-card crm-wa-card" key={item.id}>
            <header>
              <h2>{item.title}</h2>
              {item.active
                ? <span className="ds-badge ds-badge--success"><Icon name="check" size={12} />Disponível</span>
                : <span className="ds-badge ds-badge--neutral"><Icon name="eyeOff" size={12} />Desativado</span>}
            </header>
            <p className="crm-wa-card__body"><MessageText text={item.body} /></p>
            {canEdit && <footer><button type="button" className="admin-button admin-button--secondary admin-button--sm" onClick={() => setEditing(item)} aria-label={`Editar modelo ${item.title}`}><Icon name="edit" />Editar</button></footer>}
          </article>)}
        </section>
        <Pagination pager={pager} noun="modelos" label="Páginas de modelos" />
      </>}
    </>}
    {editing && <TemplateEditor record={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={async () => { await query.reload(); notify('Modelo salvo para a equipe.') }} />}
  </div>
}

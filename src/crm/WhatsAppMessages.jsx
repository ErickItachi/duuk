import { useCallback, useState } from 'react'
import { useAuth } from '../content/AuthContext'
import { useQuery } from '../office/useQuery'
import { useUnsavedChanges } from '../admin/unsavedChanges'
import { Field, PageTitle, QueryState } from '../admin/forms'
import { Icon, Modal, RefreshButton } from '../admin/components'
import { listMessageTemplates, saveMessageTemplate } from './api'
import { fillMessage, messageVariables, whatsappLink, whatsappPhone } from './whatsapp'
import './whatsapp.css'

export function WhatsAppComposer({ client, onClose, onRecord }) {
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
  return <Modal title="Conversar no WhatsApp" subtitle={client.name} onClose={onClose}>
    <div className="admin-modal__body crm-whatsapp-compose">
      <div className="crm-whatsapp-recipient"><Icon name="phone" /><div><strong>{client.name}</strong><small>{phone?.formatted || 'Telefone ausente ou inválido. Edite o cadastro com DDI e DDD.'}</small></div></div>
      <QueryState query={query}>
        <Field label="Modelo de mensagem"><select value={templateId} onChange={event => {
          const id = event.target.value
          setTemplateId(id); setOpened(false)
          setBody(query.data?.find(item => item.id === id)?.body || '')
        }}><option value="">Escrever mensagem livre</option>{query.data?.filter(item => item.active).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field>
      </QueryState>
      <Field label="Mensagem"><textarea rows={6} value={body} maxLength={3000} placeholder="Escreva ou escolha um modelo…" onChange={event => { setBody(event.target.value); setOpened(false) }} /></Field>
      {fields.length > 0 && <div className="crm-whatsapp-missing"><p>Complete os dados deste envio. Você também pode editar o cadastro para os próximos contatos.</p>{fields.map(key => {
        const field = { nome_cliente: 'name', nome_empresa: 'company', nome_projeto: 'project_name', data_evento: 'event_date' }[key]
        return field ? <Field key={key} label={{ name: 'Nome do cliente', company: 'Empresa', project_name: 'Projeto', event_date: 'Data do evento' }[field]} type={field === 'event_date' ? 'date' : 'text'} maxLength={160} value={overrides[field] ?? client[field] ?? ''} onChange={value => setOverrides(previous => ({ ...previous, [field]: value }))} /> : <p key={key}>Variável desconhecida: {'{' + key + '}'}. Ajuste a mensagem.</p>
      })}</div>}
      <div className="crm-whatsapp-preview"><small>PRÉVIA DA MENSAGEM</small><p>{resolved.text || 'A conversa abrirá sem mensagem pré-preenchida.'}</p></div>
      <p className="platform-muted">O envio acontece manualmente no WhatsApp. Abrir a conversa não registra contato, envio ou leitura no painel.</p>
      {opened && <p className="crm-whatsapp-feedback" role="status">Link aberto. Depois da conversa, registre o contato realizado aqui.</p>}
    </div>
    <div className="admin-modal__foot">
      {onRecord && <button className="admin-button admin-button--secondary" onClick={onRecord}><Icon name="check" />Registrar contato realizado</button>}
      {href ? <a className="admin-button" href={href} target="_blank" rel="noopener noreferrer" onClick={() => setOpened(true)}><Icon name="arrow" />Abrir WhatsApp</a> : <button className="admin-button" disabled>{resolved.text.length > 4000 ? 'Reduza a mensagem para abrir' : 'Complete os dados para abrir'}</button>}
    </div>
  </Modal>
}

function TemplateEditor({ record, onClose, onSaved }) {
  const [form, setForm] = useState({ title: record?.title || '', body: record?.body || '', active: record?.active ?? true })
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  useUnsavedChanges(true)
  const update = (key, value) => setForm(previous => ({ ...previous, [key]: value }))
  return <Modal title={record ? 'Editar modelo' : 'Novo modelo de mensagem'} onClose={() => !busy && onClose()}>
    <form onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError('')
      try {
        const unknown = [...form.body.matchAll(/\{([a-z_]+)\}/g)].map(match => match[1]).filter(key => !messageVariables.includes(key))
        if (unknown.length) throw new Error(`Variável não reconhecida: {${unknown[0]}}.`)
        await saveMessageTemplate({ ...form, title: form.title.trim(), body: form.body.trim() }, record)
        await onSaved(); onClose()
      } catch (cause) { setError(cause.message) } finally { setBusy(false) }
    }}>
      <div className="admin-modal__body crm-whatsapp-compose">
        <Field label="Nome do modelo" required maxLength={120} value={form.title} onChange={value => update('title', value)} />
        <Field label="Texto da mensagem"><textarea required rows={8} maxLength={3000} value={form.body} onChange={event => update('body', event.target.value)} /></Field>
        <div className="crm-message-variables"><small>INSERIR VARIÁVEL</small>{messageVariables.map(key => <button type="button" key={key} onClick={() => update('body', form.body + `{${key}}`)}>{'{' + key + '}'}</button>)}</div>
        <label className="admin-checkbox"><input type="checkbox" checked={form.active} onChange={event => update('active', event.target.checked)} />Disponível ao preparar mensagens</label>
        {error && <p className="admin-error" role="alert">{error}</p>}
      </div>
      <div className="admin-modal__foot"><button className="admin-button" disabled={busy}>{busy ? 'Salvando…' : 'Salvar modelo'}</button></div>
    </form>
  </Modal>
}

export default function MessageTemplatesPage({ notify }) {
  const auth = useAuth(), query = useQuery(useCallback(() => listMessageTemplates(), []))
  const [editing, setEditing] = useState(null)
  return <>
    <PageTitle eyebrow="COMERCIAL / WHATSAPP" title="Modelos de mensagens" description="Uma base para a conversa. O seu jeito de dizer.">
      <RefreshButton onRefresh={query.reload} />
      {auth.hasPermission('crm.activities') && <button className="admin-button" onClick={() => setEditing('new')}><Icon name="plus" />Novo modelo</button>}
    </PageTitle>
    <QueryState query={query}><section className="crm-message-grid">{query.data?.map(item => <article className="admin-panel crm-message-card" key={item.id}><div><Icon name="message" /><span className="admin-status">{item.active ? 'Disponível' : 'Desativado'}</span></div><h2>{item.title}</h2><p>{item.body}</p>{auth.hasPermission('crm.activities') && <button className="admin-text-button" onClick={() => setEditing(item)}><Icon name="edit" size={15} />Editar modelo</button>}</article>)}</section></QueryState>
    {editing && <TemplateEditor record={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={async () => { await query.reload(); notify('Modelo salvo para a equipe.') }} />}
  </>
}

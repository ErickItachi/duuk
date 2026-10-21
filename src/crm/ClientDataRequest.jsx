import { useEffect, useId, useRef, useState } from 'react'
import { Icon } from '../admin/components'

export default function ClientDataRequest({ client, disabled = false }) {
  const name = String(client?.name || '').trim().split(/\s+/)[0].slice(0, 60)
  const message = `Olá${name ? ', ' + name : ''}! Tudo bem? Aqui é da DUUK.

Para completar seu cadastro e organizar nosso atendimento, pode enviar ou confirmar:

• Nome completo;
• Empresa ou razão social (se houver);
• Telefone/WhatsApp com DDD;
• E-mail;
• Cidade;
• Nome e uma breve descrição do projeto;
• Data do evento ou período desejado (se já definido).

Se tiver, pode incluir o Instagram ou site da empresa.

Pode responder por aqui. Obrigado!`
  const id = useId(), text = useRef(null)
  const [copied, setCopied] = useState(''), [failed, setFailed] = useState(false), [open, setOpen] = useState(false)
  useEffect(() => { if (failed) { text.current?.focus(); text.current?.select() } }, [failed])
  const copy = async () => {
    try { await navigator.clipboard.writeText(message); setCopied(message); setFailed(false) }
    catch { setCopied(''); setFailed(true); setOpen(true) }
  }
  return <section className="crm-data-request" aria-label="Solicitar dados do cliente">
    <div className="crm-data-request__heading"><div><strong>Dados do cliente</strong><p>Uma mensagem pronta para pedir as informações do cadastro.</p></div><button type="button" className="admin-button admin-button--secondary" onClick={copy} disabled={disabled}><Icon name={copied === message ? 'check' : 'copy'} size={15}/>{copied === message ? 'Mensagem copiada' : 'Copiar pedido de dados'}</button></div>
    <details open={open} onToggle={event => setOpen(event.currentTarget.open)}><summary>Ver mensagem</summary><label className="ds-visually-hidden" htmlFor={id}>Mensagem para solicitar dados</label><textarea id={id} ref={text} value={message} readOnly rows={12} onFocus={event => event.currentTarget.select()}/></details>
    <p role="status" className={failed ? 'crm-data-request__error' : 'crm-data-request__status'}>{failed ? 'Não foi possível copiar automaticamente. Selecione o texto acima e copie pelo seu aparelho.' : copied === message ? 'Pronta para colar e enviar ao cliente.' : ''}</p>
  </section>
}

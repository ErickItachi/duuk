import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { supabase } from '../../content/supabase'
import { stageLabel } from '../../crm/model'
import { Icon, Modal } from '../components'
import { NavIcon } from './Sidebar'
import { commandKey } from './hooks'

const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
// PostgREST filter syntax uses these characters, so they never reach the query.
const searchable = value => value.replace(/[,()*%:"'\\.]/g, ' ').replace(/\s+/g, ' ').trim()
const searchOrder = { pages: 0, clients: 1, actions: 2, preferences: 3 }

export default function CommandPalette({ sections, canSearchClients, onRun, onClose }) {
  const dialog = useRef(null), list = useRef(null), id = useId()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [clients, setClients] = useState({ term: '', rows: [], error: '' })
  const term = searchable(query)
  const wantsClients = !!(canSearchClients && supabase && term.length >= 2)

  useEffect(() => {
    const element = dialog.current
    element.showModal()
    return () => element.close()
  }, [])

  useEffect(() => {
    if (!wantsClients) return
    let alive = true
    const timer = setTimeout(async () => {
      const pattern = `%${term}%`
      const { data, error } = await supabase.from('duuk_clients').select('id,name,company,stage').or(`name.ilike.${pattern},company.ilike.${pattern},email.ilike.${pattern}`).order('updated_at', { ascending: false }).limit(6)
      if (alive) setClients({ term, rows: error ? [] : data || [], error: error ? 'Não foi possível buscar clientes agora.' : '' })
    }, 160)
    return () => { alive = false; clearTimeout(timer) }
  }, [term, wantsClients])

  const clientsReady = wantsClients && clients.term === term
  const groups = useMemo(() => {
    const terms = fold(query).split(/\s+/).filter(Boolean)
    const visible = sections.map(section => ({ ...section, items: section.items.filter(item => terms.length ? terms.every(part => fold(`${item.label} ${item.hint || ''} ${item.keywords || ''}`).includes(part)) : !item.searchOnly) }))
    if (clientsReady && clients.rows.length) visible.push({ id: 'clients', label: 'Clientes', items: clients.rows.map(client => ({ id: `client-${client.id}`, label: client.name, hint: [client.company, stageLabel(client.stage)].filter(Boolean).join(' · '), icon: 'user', to: `/admin/comercial/clientes?cliente=${client.id}` })) })
    const filled = visible.filter(section => section.items.length)
    return terms.length ? filled.sort((a, b) => (searchOrder[a.id] ?? 9) - (searchOrder[b.id] ?? 9)) : filled
  }, [sections, query, clientsReady, clients.rows])
  const flat = groups.flatMap(group => group.items)
  const current = flat.length ? Math.min(active, flat.length - 1) : -1

  useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }) }, [current, groups])

  const keyDown = event => {
    if (!flat.length) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((current + (event.key === 'ArrowDown' ? 1 : -1) + flat.length) % flat.length)
    } else if (event.key === 'Home' && event.ctrlKey) { event.preventDefault(); setActive(0) }
    else if (event.key === 'End' && event.ctrlKey) { event.preventDefault(); setActive(flat.length - 1) }
    else if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); onRun(flat[current]) }
  }

  return <dialog ref={dialog} className="ds-palette admin-popover" aria-label="Busca e comandos" onCancel={event => { event.preventDefault(); onClose() }} onClick={event => { if (event.target === dialog.current) onClose() }}>
    <div className="ds-palette__search">
      <Icon name="search" size={18} />
      <input autoFocus role="combobox" aria-expanded="true" aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={current >= 0 ? `${id}-option-${current}` : undefined} aria-label="Buscar páginas, ações e clientes" placeholder={canSearchClients ? 'Buscar páginas, ações e clientes…' : 'Buscar páginas e ações…'} autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="go" value={query} onChange={event => { setQuery(event.target.value); setActive(0) }} onKeyDown={keyDown} />
      <button type="button" className="ds-palette__close" onClick={onClose} aria-label="Fechar busca"><kbd className="ds-kbd">Esc</kbd><Icon name="close" size={18} /></button>
    </div>
    <div className="ds-palette__results" id={`${id}-list`} role="listbox" aria-label="Resultados" ref={list}>
      {groups.map(group => <div key={group.id} role="group" aria-labelledby={`${id}-${group.id}`} className="ds-palette__group">
        <div id={`${id}-${group.id}`} className="ds-palette__label">{group.label}</div>
        {group.items.map(item => {
          const index = flat.indexOf(item)
          return <div key={item.id} id={`${id}-option-${index}`} role="option" aria-selected={index === current} className="ds-palette__item" onPointerMove={() => { if (index !== current) setActive(index) }} onClick={() => onRun(item)}>
            <span className="ds-palette__icon">{item.nav ? <NavIcon item={item.nav} size={16} /> : <Icon name={item.icon || 'arrow'} size={16} />}</span>
            <span className="ds-palette__text"><span>{item.label}</span>{item.hint && <small>{item.hint}</small>}</span>
            {item.shortcut && <span className="ds-palette__keys" aria-hidden="true">{item.shortcut.split(' ').map(key => <kbd key={key} className="ds-kbd">{key.toUpperCase()}</kbd>)}</span>}
          </div>
        })}
      </div>)}
      {wantsClients && !clientsReady && <p className="ds-palette__status" role="status"><span className="ds-spinner" aria-hidden="true" />Buscando clientes…</p>}
      {clientsReady && clients.error && <p className="ds-palette__status" role="alert">{clients.error}</p>}
      {!flat.length && (!wantsClients || clientsReady) && <div className="ds-palette__empty"><strong>Nada encontrado</strong><span>Tente outro termo{canSearchClients ? ' ou o nome de um cliente' : ''}.</span></div>}
    </div>
    <div className="ds-palette__foot" aria-hidden="true"><span><kbd className="ds-kbd">↑</kbd><kbd className="ds-kbd">↓</kbd>navegar</span><span><kbd className="ds-kbd">↵</kbd>abrir</span><span><kbd className="ds-kbd">esc</kbd>fechar</span></div>
  </dialog>
}

export function ShortcutsDialog({ navigation, canCollapse, onClose }) {
  const general = [[commandKey(), 'Buscar páginas, ações e clientes'], ['/', 'Abrir a busca'], ['?', 'Mostrar estes atalhos'], ...(canCollapse ? [['[', 'Minimizar ou expandir o menu']] : []), ['Esc', 'Fechar janelas e menus']]
  return <Modal title="Atalhos de teclado" subtitle="Funcionam quando o cursor não está em um campo de texto." onClose={onClose}>
    <div className="admin-modal__body ds-shortcuts">
      <section><h3>Geral</h3><dl>{general.map(([keys, label]) => <div key={label}><dt>{keys.split(' ').map(key => <kbd key={key} className="ds-kbd">{key}</kbd>)}</dt><dd>{label}</dd></div>)}</dl></section>
      {navigation.length > 0 && <section><h3>Ir para</h3><dl>{navigation.map(item => <div key={item.to}><dt>{item.shortcut.split(' ').map(key => <kbd key={key} className="ds-kbd">{key.toUpperCase()}</kbd>)}</dt><dd>{item.label}</dd></div>)}</dl></section>}
    </div>
  </Modal>
}

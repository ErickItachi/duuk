import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../content/AuthContext'
import { useQuery } from '../office/useQuery'
import { teamRequest } from './api'
import { Icon } from './components'
import { Avatar } from './forms'

export default function TeamPresence() {
  const auth = useAuth()
  const query = useQuery(useCallback(() => teamRequest({ action: 'directory' }), []))
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  const online = (query.data || []).filter((person) => auth.isOnline(person.id))

  useEffect(() => {
    if (!open) return
    const close = (event) => {
      if (event.key === 'Escape' || !box.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  return (
    <div className="team-presence" ref={box}>
      <button
        className="team-presence__trigger"
        type="button"
        aria-label="Pessoas online agora"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        title="Pessoas online agora"
      >
        <span className={`team-presence__pulse${auth.presenceReady ? ' is-live' : ''}`} />
        <Icon name="users" size={17} />
        <span>{auth.presenceReady ? `${online.length} online` : 'Conectando…'}</span>
      </button>
      {open && (
        <section className="team-presence__popover" role="dialog" aria-label="Equipe online">
          <div className="team-presence__head">
            <div>
              <p className="admin-eyebrow">EQUIPE / AGORA</p>
              <h2>Quem está online</h2>
            </div>
            <button className="admin-icon-button" type="button" aria-label="Fechar" onClick={() => setOpen(false)}>
              <Icon name="close" />
            </button>
          </div>
          <div className="team-presence__list">
            {online.length ? online.map((person) => (
              <div key={person.id}>
                <Avatar profile={person} size={34} />
                <span>
                  <strong>{person.name}{person.id === auth.user.id ? ' · você' : ''}</strong>
                  <small>{person.job_title || 'Equipe DUUK'}</small>
                </span>
                <i aria-hidden="true" />
              </div>
            )) : (
              <p>{auth.presenceReady ? 'Ninguém conectado neste momento.' : 'Conectando à equipe…'}</p>
            )}
          </div>
          {auth.hasPermission('team') && (
            <Link to="/admin/configuracoes/usuarios" onClick={() => setOpen(false)}>
              Ver toda a equipe
              <Icon name="arrow" size={15} />
            </Link>
          )}
        </section>
      )}
    </div>
  )
}

import { useEffect } from 'react'
import { useAuth } from '../content/AuthContext'
import { Icon, Modal } from './components'
import { currentRelease, usePwa } from './pwaState'
import { dirtyForms } from './unsavedChanges'
import { hasSeenRelease, markReleaseSeen } from './releaseSeen.mjs'
import './updates.css'

const storage = () => { try { return window.localStorage } catch { return null } }
const groups = [['new', 'Novidades', 'plus'], ['improved', 'Melhorias', 'trend'], ['fixed', 'Ajustes', 'check']]

export function ReleaseNotes({ release }) {
  return <div className="release-notes">
    <p className="release-notes__title">{release.title}</p>
    {groups.map(([key, label, icon]) => {
      const items = Array.isArray(release[key]) ? release[key].filter(item => typeof item === 'string') : []
      return items.length ? <section key={key} className="release-notes__group"><h3><span className="release-notes__icon" aria-hidden="true"><Icon name={icon} size={14} /></span>{label}</h3><ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul></section> : null
    })}
  </div>
}

export function ReleaseUpdates({ open, onOpen, onClose }) {
  const auth = useAuth()
  const pwa = usePwa()
  const release = pwa.available || currentRelease
  const userId = auth.user?.id
  useEffect(() => {
    if (!auth.isAdmin || !userId || hasSeenRelease(storage(), userId, release.version)) return
    let timer
    const reveal = () => {
      if (hasSeenRelease(storage(), userId, release.version)) return
      if (document.hidden || dirtyForms.size || document.querySelector('dialog[open], .duuk-loader:not(.is-leaving)')) {
        timer = setTimeout(reveal, 1200)
        return
      }
      onOpen({ userId, release })
    }
    timer = setTimeout(reveal, 1800)
    return () => clearTimeout(timer)
  }, [auth.isAdmin, userId, release, onOpen])
  const shown = open && open.userId === userId ? open.release : null
  if (!auth.isAdmin || !shown) return null
  const close = () => {
    markReleaseSeen(storage(), userId, shown.version)
    onClose()
  }
  const available = pwa.available?.version === shown.version
  return <Modal title="Novidades da DUUK" subtitle={`Versão ${shown.version}${available ? ' · disponível para atualizar' : ''}`} onClose={close}>
    <div className="admin-release-content"><ReleaseNotes release={shown} /></div>
    <div className="admin-modal__foot">
      {available ? <><button type="button" className="admin-button admin-button--secondary" onClick={close}>Agora não</button><button type="button" className="admin-button" disabled={pwa.checking || !!pwa.updating} onClick={() => { close(); pwa.update() }}>Atualizar app<Icon name="arrow" size={16} /></button></> : <button type="button" className="admin-button" onClick={close}>Continuar<Icon name="arrow" size={16} /></button>}
    </div>
  </Modal>
}

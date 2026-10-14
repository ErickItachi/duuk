import { useEffect, useState } from 'react'
import './admin-loader.css'

// Progress moves only when a real step finishes: app, admin module, session, permissions.
const loaderSteps = {
  boot: [0.12, 'Abrindo o DUUK Admin'],
  module: [0.38, 'Carregando o painel'],
  session: [0.62, 'Verificando sua sessão'],
  access: [0.86, 'Conferindo suas permissões'],
  ready: [1, 'Pronto'],
}

// The loader is mounted again at each step (app chunk, session, permissions). The opening reveal
// plays once per page load; later mounts continue from where the screen already is.
let revealed = false

export default function AdminLoader({ step = 'boot', leaving = false }) {
  const [progress, label] = loaderSteps[step] || loaderSteps.boot
  const [continued] = useState(() => revealed)
  useEffect(() => { revealed = true }, [])
  return <div className={`admin-loader${leaving ? ' is-leaving' : ''}${continued ? ' is-continued' : ''}`} role="status" aria-live="polite" aria-atomic="true" style={{ '--admin-loader-progress': progress }}>
    <span className="admin-loader__light" aria-hidden="true" />
    <span className="admin-loader__reel is-top" aria-hidden="true" />
    <span className="admin-loader__reel is-bottom" aria-hidden="true" />
    <div className="admin-loader__content">
      <div className="admin-loader__stage">
        <span className="admin-loader__frame" aria-hidden="true"><i /><i /><i /><i /></span>
        <img className="admin-loader__logo" src="/media/duuk-logo-white.png" alt="DUUK" width="718" height="886" fetchPriority="high" />
      </div>
      <span className="admin-loader__brand" aria-hidden="true">Films · Admin</span>
      <span className="admin-loader__progress" aria-hidden="true"><span /></span>
      <p className="admin-loader__label">{step === 'ready' ? label : `${label}…`}</p>
    </div>
  </div>
}

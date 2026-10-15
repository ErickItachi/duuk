import './admin-loader.css'

// Progress moves only when a real step finishes: app, admin module, session, permissions.
const loaderSteps = {
  boot: 'Abrindo o DUUK Admin',
  module: 'Carregando o painel',
  session: 'Verificando sua sessão',
  access: 'Conferindo suas permissões',
  ready: 'Pronto',
}

export default function AdminLoader({ step = 'boot', leaving = false }) {
  const label = loaderSteps[step] || loaderSteps.boot
  return <div className={`admin-loader${leaving ? ' is-leaving' : ''}`} role="status" aria-live="polite" aria-atomic="true">
    <div className="admin-loader__content">
      <img className="admin-loader__logo" src="/media/duuk-logo-white.png" alt="DUUK" width="718" height="886" fetchPriority="high" />
      <div className="admin-loader__status"><span className="admin-loader__spinner" aria-hidden="true" /><p className="admin-loader__label">{step === 'ready' ? label : `${label}…`}</p></div>
    </div>
  </div>
}

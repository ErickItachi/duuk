import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../content/AuthContext'
import { Icon } from './components'
import './admin.css'

export default function LoginPage() {
  const auth = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('')
    try { try { localStorage.setItem('duuk-remember', String(remember)) } catch {} await auth.signIn(email, password); setPassword('') } catch (cause) { setError(cause.message) }
    finally { setBusy(false) }
  }
  return <main className="admin-login admin-shell">
    <div className="admin-login__visual"><img className="admin-login__cover" src="/media/images/sobre-set-640.ed49c1b0f43a.webp" alt="" width="640" height="961" fetchPriority="high" /><Link className="admin-brand" to="/" aria-label="Voltar ao site da DUUK"><img src="/media/duuk-logo-white.png" width="52" height="64" alt="DUUK" /><span>ADMIN<small>O espaço da nossa equipe.</small></span></Link><div className="admin-login__story"><p className="admin-eyebrow">IDEIAS EM MOVIMENTO</p><h1>Criar é só<br />o começo<span>.</span></h1><p>Um olhar para cada história.<br />Um lugar para fazer acontecer.</p></div><span className="admin-sidebar__signature">DUUK® / SÃO PAULO</span></div>
    <section className="admin-login__form"><span className="admin-login__tag">ACESSO DA EQUIPE</span><h2>Bom ter você aqui.</h2><p>Entre para continuar de onde parou.</p>
      {!auth.ready ? <p role="status">Verificando seu acesso…</p> : auth.user && !auth.isAdmin ? <><p className="admin-error" role="alert">{auth.error}</p><button className="admin-button" onClick={() => auth.signOut().catch((cause) => setError(cause.message))}>Entrar com outra conta</button></> : <form onSubmit={submit}>
        <label className="admin-field"><span>E-mail</span><input type="email" autoComplete="username" inputMode="email" placeholder="voce@duukfilms.com" required value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} /></label>
        <div className="admin-field"><label htmlFor="admin-password">Senha</label><div className="admin-password"><input id="admin-password" type={visible ? 'text' : 'password'} autoComplete="current-password" placeholder="Sua senha" required value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} /><button type="button" className="admin-icon-button" aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={visible} onClick={() => setVisible(!visible)}><Icon name={visible ? 'eyeOff' : 'eye'} /></button></div></div>
        <label className="admin-check"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} disabled={busy} />Manter conectado neste dispositivo</label>
        {(error || auth.error) && <p className="admin-error" role="alert">{error || auth.error}</p>}
        <button className="admin-button" disabled={busy} aria-busy={busy}>{busy ? 'Entrando…' : 'Entrar no DUUK Admin'}<Icon name={busy ? 'refresh' : 'arrow'} className={busy ? 'is-spinning' : ''} /></button>
      </form>}
      <p className="admin-login__foot">Seu estúdio. Seu ritmo.</p><Link className="admin-text-button" to="/">Site da DUUK <Icon name="arrow" size={14} /></Link>
    </section>
  </main>
}

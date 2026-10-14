import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../content/AuthContext'
import { Icon } from './components'
import { ThemeToggle } from './AdminTheme'
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
    try { try { localStorage.setItem('duuk-remember', String(remember)) } catch { /* The session still works for this visit. */ } await auth.signIn(email, password); setPassword('') } catch (cause) { setError(cause.message) }
    finally { setBusy(false) }
  }
  const message = error || auth.error
  return <main className="admin-login">
    <section className="admin-login__panel">
      <header className="admin-login__top">
        <Link className="ds-brand" to="/" aria-label="Voltar ao site da DUUK"><img src="/media/duuk-logo-white.png" width="718" height="886" alt="" /><span>Admin</span></Link>
        <ThemeToggle />
      </header>
      <div className="admin-login__body">
        <h1>Entrar no DUUK Admin</h1>
        <p className="admin-login__lead">Use o e-mail e a senha da sua conta da equipe.</p>
        {!auth.ready ? <p className="admin-login__status" role="status"><span className="ds-spinner" aria-hidden="true" />Verificando seu acesso…</p> : auth.user && !auth.isAdmin ? <div className="admin-login__denied"><p className="admin-error" role="alert"><Icon name="alertCircle" />{auth.error || 'Esta conta não tem acesso ao DUUK Admin.'}</p><button className="admin-button admin-button--secondary admin-button--block" onClick={() => auth.signOut().catch((cause) => setError(cause.message))}>Entrar com outra conta</button></div> : <form className="admin-login__form" onSubmit={submit}>
          <label className="admin-field"><span>E-mail</span><input type="email" autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} placeholder="voce@duukfilms.com" required value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} aria-invalid={message ? true : undefined} /></label>
          <div className="admin-field"><label className="admin-label" htmlFor="admin-password">Senha</label><div className="admin-password"><input id="admin-password" type={visible ? 'text' : 'password'} autoComplete="current-password" placeholder="Sua senha" required value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} aria-invalid={message ? true : undefined} /><button type="button" className="admin-icon-button" aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={visible} onClick={() => setVisible(!visible)}><Icon name={visible ? 'eyeOff' : 'eye'} /></button></div></div>
          <label className="admin-check"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} disabled={busy} />Manter conectado neste dispositivo</label>
          {message && <p className="admin-error" role="alert"><Icon name="alertCircle" />{message}</p>}
          <button className="admin-button admin-button--block admin-login__submit" disabled={busy} aria-busy={busy}>{busy ? <><span className="ds-spinner ds-spinner--inverse" aria-hidden="true" />Entrando…</> : <>Entrar<Icon name="right" /></>}</button>
        </form>}
      </div>
      <footer className="admin-login__foot"><Link to="/"><Icon name="back" size={14} />Site da DUUK</Link><span>Acesso restrito à equipe</span></footer>
    </section>
    <aside className="admin-login__visual" aria-hidden="true">
      <img src="/media/images/sobre-set-682.b3883b9ee0e6.webp" srcSet="/media/images/sobre-set-640.ed49c1b0f43a.webp 640w, /media/images/sobre-set-682.b3883b9ee0e6.webp 682w" sizes="45vw" alt="" width="682" height="1024" fetchPriority="high" />
      <p>Ideias em movimento.</p>
    </aside>
  </main>
}

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../content/AuthContext'
import './admin.css'

export default function LoginPage() {
  const auth = useAuth()
  const [email, setEmail] = useState('contato@duukfilms.com')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('')
    try { await auth.signIn(email, password); setPassword('') } catch (cause) { setError(cause.message) }
    finally { setBusy(false) }
  }
  return <main className="admin-login admin-shell">
    <div className="admin-login__visual"><Link className="admin-brand" to="/?preview=published"><img src="/media/duuk-logo-white.png" alt="" /><span>DUUK<small>STUDIO / PAINEL</small></span></Link><div><p className="admin-eyebrow">SEU CONTEÚDO / SUA VISÃO</p><h1>A próxima cena<br />começa aqui<span>.</span></h1><p>Um espaço para cuidar dos filmes e das histórias que levam a sua assinatura.</p></div><span className="admin-sidebar__signature">DUUK® / SÃO PAULO</span></div>
    <section className="admin-login__form"><span className="admin-login__tag">AMBIENTE DE PREVIEW</span><h2>Bem-vindo ao painel.</h2><p>Entre para administrar o portfólio e a abertura do site.</p>
      {!auth.ready ? <p role="status">Verificando seu acesso…</p> : auth.user && !auth.isAdmin ? <><p className="admin-error" role="alert">{auth.error}</p><button className="admin-button" onClick={() => auth.signOut().catch((cause) => setError(cause.message))}>Entrar com outra conta</button></> : <form onSubmit={submit}>
        <label className="admin-field"><span>E-mail</span><input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} /></label>
        <label className="admin-field"><span>Senha</span><input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} /></label>
        {(error || auth.error) && <p className="admin-error" role="alert">{error || auth.error}</p>}
        <button className="admin-button" disabled={busy}>{busy ? 'Entrando…' : 'Entrar no painel'}<span aria-hidden="true">↗</span></button>
      </form>}
      <p className="admin-login__foot">As alterações são aplicadas apenas ao preview.</p><Link className="admin-text-button" to="/?preview=published">Voltar ao site de preview ↗</Link>
    </section>
  </main>
}

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../content/AuthContext'
import { supabase } from '../content/supabase'
import { PageTitle } from './forms'
import { ConfirmModal } from './components'
import MfaPanel from './MfaPanel'
import './security.css'

export default function SecurityPage() {
  const auth = useAuth()
  const [factors, setFactors] = useState([]), [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false), [removing, setRemoving] = useState(null), [closing, setClosing] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
  const reload = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const { data, error: cause } = await supabase.auth.mfa.listFactors()
      if (cause) throw cause
      setFactors((data.totp || []).filter(factor => factor.status === 'verified'))
    } catch { setError('Não foi possível consultar seus autenticadores. Tente novamente.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { const timer = setTimeout(reload, 0); return () => clearTimeout(timer) }, [reload])
  const remove = async () => {
    if (busy || factors.length < 2) return
    setBusy(true); setError(''); setMessage('')
    try {
      const result = await supabase.auth.mfa.unenroll({ factorId: removing.id })
      if (result.error) throw result.error
      const refreshed = await supabase.auth.refreshSession()
      if (refreshed.error) throw refreshed.error
      setRemoving(null); await reload(); await auth.refreshAccess()
      setMessage('Autenticador removido. Os demais continuam protegendo sua conta.')
    } catch { setError('Não foi possível remover. Confirme seu acesso novamente e tente outra vez.') }
    finally { setBusy(false) }
  }
  const closeOthers = async () => {
    setBusy(true); setError(''); setMessage('')
    try {
      const { error: cause } = await supabase.auth.signOut({ scope: 'others' })
      if (cause) throw cause
      setClosing(false); setMessage('As outras sessões foram encerradas. Este aparelho continua conectado.')
    } catch { setError('Não foi possível encerrar as outras sessões. Confira a conexão e tente novamente.') }
    finally { setBusy(false) }
  }
  return <>
    <PageTitle title="Segurança" description="Proteção da sua conta e dos seus dispositivos." />
    <div className="admin-security">
      {error && <p className="admin-error" role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <section className="admin-panel">
        <h2>Dois fatores obrigatórios</h2><p>Além da senha, sua conta exige um código do aplicativo autenticador. Cadastre um segundo autenticador ou guarde a chave em um local seguro para recuperar seu acesso se perder o aparelho. A DUUK nunca pede seu código ou chave por mensagem.</p>
        {loading ? <p role="status">Verificando autenticadores…</p> : <ul className="admin-security__factors">{factors.map(factor => <li key={factor.id}><span>{factor.friendly_name || 'Autenticador DUUK'}</span><button type="button" className="admin-text-button" disabled={busy || factors.length < 2} onClick={() => setRemoving(factor)}>Remover</button></li>)}</ul>}
        {adding ? <MfaPanel requirement={{ step: 'enroll', factors: [] }} onVerified={async () => { setAdding(false); await reload(); setMessage('Autenticador adicionado.') }} onCancel={() => setAdding(false)} /> : <button type="button" className="admin-button admin-button--secondary" disabled={loading || busy} onClick={() => setAdding(true)}>Adicionar outro autenticador</button>}
        <p>Para trocar de celular, adicione o novo autenticador e confirme seu código antes de remover o anterior. Sem acesso a nenhum autenticador, procure o proprietário da DUUK para recuperação pelo Supabase; a senha sozinha não remove esta proteção.</p>
      </section>
      <section className="admin-panel"><h2>Outros dispositivos</h2><p>Encerre as outras sessões se usou um aparelho compartilhado ou suspeita de acesso indevido. Os tokens dessas sessões deixam de acessar dados privados, mesmo antes de expirarem.</p><button type="button" className="admin-button admin-button--secondary" disabled={busy} onClick={() => setClosing(true)}>Encerrar outras sessões</button></section>
    </div>
    {removing && <ConfirmModal title="Remover este autenticador?" message="Confirme que você tem acesso ao outro autenticador. O último autenticador deve ser mantido." action="Remover" onClose={() => !busy && setRemoving(null)} onConfirm={remove} />}
    {closing && <ConfirmModal title="Encerrar outras sessões?" message="Todos os outros aparelhos precisarão entrar novamente com senha e autenticador. Este aparelho permanece conectado." action="Encerrar sessões" onClose={() => !busy && setClosing(false)} onConfirm={closeOthers} />}
  </>
}

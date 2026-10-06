import { useEffect, useState } from 'react'
import { AuthContext } from './AuthContext'
import { supabase } from './supabase'

export function AuthProvider({ children }) {
  const [state, setState] = useState({ ready: !supabase, user: null, isAdmin: false, error: '' })
  useEffect(() => {
    if (!supabase) return
    let active = true
    let revision = 0
    const validate = async () => {
      const current = ++revision
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError
        if (!session) {
          if (active && current === revision) setState({ ready: true, user: null, isAdmin: false, error: '' })
          return
        }
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error) throw error
        const { data: member, error: membershipError } = await supabase.from('duuk_admins').select('user_id').eq('user_id', user.id).maybeSingle()
        if (membershipError) throw membershipError
        if (active && current === revision) setState({ ready: true, user, isAdmin: Boolean(member), error: member ? '' : 'Esta conta não tem acesso ao painel.' })
      } catch {
        if (active && current === revision) setState({ ready: true, user: null, isAdmin: false, error: 'Não foi possível verificar o acesso. Confira a conexão e tente novamente.' })
      }
    }
    validate()
    // Do not await client requests inside an auth callback; it holds the auth lock.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        revision++
        setState({ ready: true, user: null, isAdmin: false, error: '' })
      } else if (event !== 'INITIAL_SESSION') window.setTimeout(() => { if (active) validate() }, 0)
    })
    return () => { active = false; revision++; subscription.unsubscribe() }
  }, [])
  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) throw new Error(error.status === 400 ? 'E-mail ou senha inválidos.' : 'Não foi possível entrar. Tente novamente em instantes.')
  }
  const signOut = async () => {
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) throw new Error('Não foi possível encerrar a sessão. Tente novamente.')
  }
  return <AuthContext.Provider value={{ ...state, signIn, signOut }}>{children}</AuthContext.Provider>
}

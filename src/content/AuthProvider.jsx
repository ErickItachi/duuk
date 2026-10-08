import { useCallback, useEffect, useRef, useState } from 'react'
import { AuthContext } from './AuthContext'
import { supabase } from './supabase'
import { teamRequest, notificationRequest } from '../admin/api'

const empty = { ready: !supabase, user: null, profile: null, permissions: {}, isAdmin: false, error: '' }
export function AuthProvider({ children }) {
  const [state, setState] = useState(empty)
  const [presence, setPresence] = useState({ ready: false, ids: [] })
  const revision = useRef(0)
  const active = useRef(true)
  const refreshAccess = useCallback(async () => {
    const current = ++revision.current
    if (!supabase) return
    if (navigator.onLine === false) { if (active.current && current === revision.current) setState(previous => previous.isAdmin ? { ...previous, ready: true } : { ...empty, ready: true, error: 'Conecte-se para verificar seu acesso.' }); return }
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      if (!session) { if (active.current && current === revision.current) setState({ ...empty, ready: true }); return }
      const { data: { user }, error } = await supabase.auth.getUser()
      if (error) throw error
      try {
        const context = await teamRequest({ action: 'context' })
        if (active.current && current === revision.current) setState({ ready: true, user, ...context, isAdmin: true, error: '' })
      } catch (cause) {
        if (active.current && current === revision.current) setState(previous => navigator.onLine === false && previous.isAdmin ? { ...previous, ready: true } : { ...empty, ready: true, user, error: cause.message })
      }
    } catch {
      if (active.current && current === revision.current) setState(previous => navigator.onLine === false && previous.isAdmin ? { ...previous, ready: true } : { ...empty, ready: true, error: 'Não foi possível verificar o acesso. Confira a conexão e tente novamente.' })
    }
  }, [])
  const cancelPending = useCallback(() => { active.current = false; revision.current++ }, [])
  useEffect(() => {
    if (!supabase) return
    active.current = true
    const initial = window.setTimeout(refreshAccess, 0)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') { revision.current++; setState({ ...empty, ready: true }) }
      else if (event !== 'INITIAL_SESSION') window.setTimeout(() => { if (active.current) refreshAccess() }, 0)
    })
    const focus = () => { if (document.visibilityState === 'visible' && navigator.onLine) refreshAccess() }
    window.addEventListener('focus', focus); window.addEventListener('online', focus)
    const interval = setInterval(focus, 60000)
    return () => { window.clearTimeout(initial); cancelPending(); subscription.unsubscribe(); window.removeEventListener('focus', focus); window.removeEventListener('online', focus); clearInterval(interval) }
  }, [refreshAccess, cancelPending])
  useEffect(() => {
    if (!supabase || !state.isAdmin || !state.user?.id) {
      return
    }
    let alive = true
    const channel = supabase.channel('duuk:team:presence', {
      config: {
        private: true,
        presence: { key: `${state.user.id}:${crypto.randomUUID()}` },
      },
    })
    const sync = () => {
      if (!alive) return
      const ids = [...new Set(
        Object.values(channel.presenceState())
          .flat()
          .map((item) => item.user_id)
          .filter(Boolean),
      )]
      setPresence({ ready: true, ids })
    }
    channel
      .on('presence', { event: 'sync' }, sync)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          if (alive) setPresence({ ready: false, ids: [] })
          try {
            await channel.track({ user_id: state.user.id, online_at: new Date().toISOString() })
          } catch {
            if (alive) setPresence((previous) => ({ ...previous, ready: false }))
          }
        } else if (alive && ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
          setPresence((previous) => ({ ...previous, ready: false }))
        }
      })
    return () => {
      alive = false
      channel.untrack().catch(() => {})
      supabase.removeChannel(channel)
    }
  }, [state.isAdmin, state.user?.id])
  const signIn = async (email, password) => {
    if (navigator.onLine === false) throw new Error('Reconecte para entrar no painel.')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) throw new Error(error.status === 400 ? 'E-mail ou senha inválidos.' : 'Não foi possível entrar. Tente novamente em instantes.')
    await refreshAccess()
  }
  const signOut = async () => {
    // Remove only this device before ending this browser session.
    try { if ('serviceWorker' in navigator) { const registration = await navigator.serviceWorker.getRegistration('/admin/'); const subscription = await registration?.pushManager?.getSubscription(); if (subscription) { await notificationRequest({ action: 'unsubscribe', endpoint: subscription.endpoint }); await subscription.unsubscribe() } } } catch {}
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) throw new Error('Não foi possível encerrar a sessão. Tente novamente.')
  }
  const hasPermission = useCallback((key) => state.isAdmin && (!key || state.profile?.is_super_admin || (state.permissions[key] === true && (!key.startsWith('crm.') || state.permissions.crm === true))), [state.isAdmin, state.profile?.is_super_admin, state.permissions])
  const isOnline = useCallback((id) => presence.ids.includes(id), [presence.ids])
  return <AuthContext.Provider value={{ ...state, onlineIds: presence.ids, presenceReady: presence.ready, isOnline, hasPermission, refreshAccess, signIn, signOut }}>{children}</AuthContext.Provider>
}

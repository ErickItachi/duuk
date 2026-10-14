import { lazy, Suspense, useCallback, useMemo } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { Icon } from '../admin/components'
import { ErrorState, LoadingPanel, PageTitle } from '../admin/forms'
import { useQuery } from '../office/useQuery'
import { loadPosts, socialRequest } from './api'
import { SocialContext } from './context'
import SocialHome from './SocialHome'
import './social.css'

const Composer = lazy(() => import('./Composer'))
const SocialCalendar = lazy(() => import('./SocialCalendar'))
const SocialLibrary = lazy(() => import('./SocialLibrary'))
const SocialInsights = lazy(() => import('./SocialInsights'))
const SocialConnection = lazy(() => import('./SocialConnection'))

const sections = [
  { to: '/admin/social', label: 'Visão geral', icon: 'grid', end: true },
  { to: '/admin/social/publicar', label: 'Publicar', icon: 'compose' },
  { to: '/admin/social/calendario', label: 'Calendário', icon: 'calendar' },
  { to: '/admin/social/biblioteca', label: 'Biblioteca', icon: 'media' },
  { to: '/admin/social/insights', label: 'Insights', icon: 'trend' },
  { to: '/admin/social/conexao', label: 'Conexão', icon: 'plug' },
]

export default function SocialPage({ notify }) {
  const statusQuery = useQuery(useCallback(() => socialRequest({ action: 'status' }), []))
  const postsQuery = useQuery(useCallback(() => loadPosts(), []))
  const status = statusQuery.data
  const accounts = useMemo(() => status?.accounts || [], [status])
  const active = useMemo(() => accounts.filter(account => account.status === 'active'), [accounts])
  const value = useMemo(() => ({ notify, status, statusQuery, accounts, active, postsQuery, posts: postsQuery.data?.posts || [], library: postsQuery.data?.media || [] }), [notify, status, statusQuery, accounts, active, postsQuery])
  const fallback = <LoadingPanel label="Abrindo Social Media…" />
  return <SocialContext.Provider value={value}>
    <div className="social-page">
      <PageTitle eyebrow="ADMINISTRATIVO / SOCIAL MEDIA" title="Social Media" description="Instagram da DUUK pela API oficial: publique, agende e acompanhe resultados reais." />
      <nav className="ds-tabs social-tabs" aria-label="Seções do Social Media">
        {sections.map(section => <NavLink key={section.to} to={section.to} end={section.end}><Icon name={section.icon} size={16} />{section.label}</NavLink>)}
      </nav>
      {statusQuery.error && !status ? <ErrorState onRetry={statusQuery.reload}>{statusQuery.error}</ErrorState> : !status ? fallback : <Suspense fallback={fallback}>
        <Routes>
          <Route index element={<SocialHome />} />
          <Route path="publicar" element={<Composer />} />
          <Route path="calendario" element={<SocialCalendar />} />
          <Route path="biblioteca" element={<SocialLibrary />} />
          <Route path="insights" element={<SocialInsights />} />
          <Route path="conexao" element={<SocialConnection />} />
          <Route path="*" element={<Navigate to="/admin/social" replace />} />
        </Routes>
      </Suspense>}
    </div>
  </SocialContext.Provider>
}

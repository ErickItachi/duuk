import { lazy, Suspense, useEffect } from 'react'
import { Link, Route, Routes, useLocation } from 'react-router-dom'
import { Logo } from './components/Site'
import { LanguageProvider } from './i18n'
import HomePage from './pages/HomePage'
import { loadSecondaryPages } from './pages/loadPages'
import { ContentProvider } from './content/ContentProvider'
import { useContent } from './content/useContent'
import { previewEnabled } from './content/config'
import { AuthProvider } from './content/AuthProvider'

const AdminPage = previewEnabled ? lazy(() => import('./admin/AdminPage')) : null

const lazyPage = (name) =>
  lazy(() => loadSecondaryPages().then((pages) => ({ default: pages[name] })))

const AboutPage = lazyPage('AboutPage')
const ContactPage = lazyPage('ContactPage')
const DirectorPage = lazyPage('DirectorPage')
const NotFoundPage = lazyPage('NotFoundPage')
const PortfolioPage = lazyPage('PortfolioPage')
const PrivacyPage = lazyPage('PrivacyPage')
const ProjectPage = lazyPage('ProjectPage')

function prefetchRoute(event) {
  const link = event.target.closest('a[href]')
  if (link?.origin === window.location.origin && link.pathname !== '/') {
    loadSecondaryPages().catch(() => {})
  }
}

function ScrollManager() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (hash) {
      const target = document.getElementById(decodeURIComponent(hash.slice(1)))
      if (target) {
        target.scrollIntoView()
        return
      }
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname, hash])

  return null
}

function IntroLoader({ visible, animate = true }) {
  return (
    <div
      className={`intro-loader${visible ? ' is-visible' : ''}${animate ? '' : ' intro-loader--still'}`}
      aria-hidden="true"
    >
      <div className="intro-loader__content">
        <div className="intro-loader__logo">
          <span className="intro-loader__half intro-loader__half--top">
            <Logo priority />
          </span>
          <span className="intro-loader__half intro-loader__half--bottom">
            <Logo priority />
          </span>
        </div>
        <span className="intro-loader__line" />
      </div>
    </div>
  )
}

function AppRoutes() {
  const location = useLocation()

  return (
    <>
      <Suspense fallback={<IntroLoader visible animate={false} />}>
        <div
          className="route-view"
          key={location.pathname}
          onPointerOver={prefetchRoute}
          onPointerDown={prefetchRoute}
          onFocus={prefetchRoute}
        >
          <ScrollManager />
          <Routes location={location}>
            {previewEnabled && <Route path="/admin/*" element={<AdminPage />} />}
            <Route path="/" element={<HomePage />} />
            <Route path="/portfolio" element={<PortfolioPage />} />
            <Route path="/projeto/:slug" element={<ProjectPage />} />
            <Route path="/sobre" element={<AboutPage />} />
            <Route path="/sobre/:slug" element={<DirectorPage />} />
            <Route path="/contato" element={<ContactPage />} />
            <Route
              path="/politica-de-privacidade"
              element={<PrivacyPage />}
            />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </div>
      </Suspense>
    </>
  )
}

function PreviewNotice() {
  const { pathname } = useLocation()
  const { viewMode } = useContent()
  if (!previewEnabled || pathname.startsWith('/admin')) return null
  return (
    <aside className="preview-notice" aria-label="Ambiente de preview">
      <span>{viewMode === 'draft' ? 'Prévia do rascunho' : 'Site de preview'}</span>
      <Link to="/admin">Abrir painel ↗</Link>
      {viewMode === 'draft' && <Link to="/?preview=published">Ver versão publicada no preview</Link>}
    </aside>
  )
}

function App() {
  return (
    <AuthProvider>
      <ContentProvider>
        <LanguageProvider>
          <AppRoutes />
          <PreviewNotice />
        </LanguageProvider>
      </ContentProvider>
    </AuthProvider>
  )
}

export default App

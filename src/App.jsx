import { lazy, Suspense, useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { Logo } from './components/Site'
import { LanguageProvider } from './i18n'
import HomePage from './pages/HomePage'
import { loadSecondaryPages } from './pages/loadPages'
import { ContentProvider } from './content/ContentProvider'
import { adminEnabled } from './content/config'
import { AuthProvider } from './content/AuthProvider'
import AnalyticsTracker from './office/AnalyticsTracker'

const AdminPage = adminEnabled ? lazy(() => import('./admin/AdminPage')) : null
const SigningPage = lazy(() => import('./office/SigningPage'))

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
    if (/^\/(admin|assinar)(\/|$)/.test(pathname)) {
      let robots = document.querySelector('meta[name=robots]')
      if (!robots) { robots = document.createElement('meta'); robots.name = 'robots'; robots.dataset.duukAdmin = 'true'; document.head.append(robots) }
      robots.content = 'noindex, nofollow'
    } else document.querySelector('meta[data-duuk-admin]')?.remove()
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
            {adminEnabled && <Route path="/admin/*" element={<AdminPage />} />}
            <Route path="/assinar/:token" element={<SigningPage />} />
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

function App() {
  return (
    <AuthProvider>
      <ContentProvider>
        <LanguageProvider>
          <AppRoutes />
          <AnalyticsTracker />
        </LanguageProvider>
      </ContentProvider>
    </AuthProvider>
  )
}

export default App

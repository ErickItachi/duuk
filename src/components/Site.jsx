import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, NavLink } from 'react-router-dom'
import AmbientVideo from './AmbientVideo'
import DeferredImage from './DeferredImage'
import { directors } from '../data/directors'
import { localize, useLanguage } from '../i18n'
import { studio } from '../data/projects'

const routes = [
  ['home', '/'],
  ['portfolio', '/portfolio'],
  ['about', '/sobre'],
  ['contact', '/contato'],
]

export function Logo({ className = '', priority = false }) {
  return (
    <img
      className={`duuk-logo ${className}`.trim()}
      src="/media/duuk-logo-white.png"
      alt="DUUK"
      width="718"
      height="886"
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
    />
  )
}

export function LanguageToggle({ compact = false }) {
  const { language, setLanguage, t } = useLanguage()

  return (
    <div
      className={`language-toggle${compact ? ' language-toggle--compact' : ''}`}
      aria-label={t.language}
    >
      <button
        type="button"
        className={language === 'pt' ? 'is-active' : ''}
        aria-pressed={language === 'pt'}
        onClick={() => setLanguage('pt')}
      >
        PT
      </button>
      <span aria-hidden="true">—</span>
      <button
        type="button"
        className={language === 'en' ? 'is-active' : ''}
        aria-pressed={language === 'en'}
        onClick={() => setLanguage('en')}
      >
        EN
      </button>
    </div>
  )
}

function AboutSubmenu() {
  return (
    <div className="nav-sub">
      {directors.map((director) => (
        <NavLink key={director.slug} to={`/sobre/${director.slug}`}>
          {director.display}
        </NavLink>
      ))}
    </div>
  )
}

function NavigationLinks({ className }) {
  const { t } = useLanguage()

  return (
    <nav className={className} aria-label="Main">
      {routes.map(([key, href]) =>
        key === 'about' ? (
          <div key={href} className="nav-item nav-item--sub">
            <NavLink
              to={href}
              className={({ isActive }) => (isActive ? 'is-active' : '')}
            >
              {t.nav[key]}
            </NavLink>
            <AboutSubmenu />
          </div>
        ) : (
          <NavLink
            key={href}
            to={href}
            end={href === '/'}
            className={({ isActive }) => (isActive ? 'is-active' : '')}
          >
            {t.nav[key]}
          </NavLink>
        ),
      )}
    </nav>
  )
}

export function Header({ home = false }) {
  const { t } = useLanguage()
  const [menuOpen, setMenuOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 801px)')
    const heroNav = home ? document.querySelector('.hero-navigation') : null
    let observer
    const onScroll = () => setScrolled(window.scrollY > 40)

    const updateNavigation = () => {
      observer?.disconnect()
      window.removeEventListener('scroll', onScroll)

      if (heroNav && desktop.matches) {
        observer = new IntersectionObserver(
          ([entry]) => setScrolled(!entry.isIntersecting),
          { rootMargin: '0px 0px 35% 0px' },
        )
        observer.observe(heroNav)
      } else {
        onScroll()
        window.addEventListener('scroll', onScroll, { passive: true })
      }
    }

    updateNavigation()
    desktop.addEventListener('change', updateNavigation)
    return () => {
      observer?.disconnect()
      desktop.removeEventListener('change', updateNavigation)
      window.removeEventListener('scroll', onScroll)
    }
  }, [home])

  useEffect(() => {
    if (!menuOpen) setAboutOpen(false)
  }, [menuOpen])

  useEffect(() => {
    document.body.classList.toggle('menu-is-open', menuOpen)
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.classList.remove('menu-is-open')
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  return (
    <>
      <a className="skip-link" href="#conteudo">
        {t.skip}
      </a>
      <header
        className={[
          'site-header',
          home ? 'site-header--home' : '',
          scrolled ? 'is-scrolled' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <Link
          className="header-logo"
          to="/"
          aria-label="DUUK"
          tabIndex={home && !scrolled ? -1 : 0}
        >
          <Logo priority />
        </Link>

        <NavigationLinks className="desktop-navigation" />

        <div className="header-language">
          <LanguageToggle />
        </div>

        <button
          type="button"
          className={`menu-button${menuOpen ? ' is-open' : ''}`}
          aria-label={menuOpen ? t.closeMenu : t.openMenu}
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          onClick={() => setMenuOpen((isOpen) => !isOpen)}
        >
          <span />
          <span />
        </button>
      </header>

      <div
        id="mobile-navigation"
        className={`mobile-menu${menuOpen ? ' is-open' : ''}${aboutOpen ? ' is-about-open' : ''}`}
        aria-hidden={!menuOpen}
      >
        <div className="mobile-menu__top">
          <span>DUUK® / 2026</span>
          <LanguageToggle compact />
        </div>
        <nav aria-label="Mobile">
          {routes.map(([key, href]) => (
            <div key={href}>
              <NavLink
                to={href}
                end={href === '/'}
                tabIndex={menuOpen ? 0 : -1}
                aria-expanded={key === 'about' ? aboutOpen : undefined}
                onClick={(event) => {
                  if (key === 'about' && !aboutOpen) {
                    event.preventDefault()
                    setAboutOpen(true)
                    return
                  }
                  setMenuOpen(false)
                }}
              >
                {t.nav[key]}
              </NavLink>
              {key === 'about' && (
                <div className="mobile-menu__sub">
                  <div className="mobile-menu__sub-inner">
                    {directors.map((director) => (
                      <NavLink
                        key={director.slug}
                        to={`/sobre/${director.slug}`}
                        tabIndex={menuOpen && aboutOpen ? 0 : -1}
                        onClick={() => setMenuOpen(false)}
                      >
                        {director.display}
                      </NavLink>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </nav>
        <div className="mobile-menu__footer">
          <a href={`mailto:${studio.email}`}>{studio.email.toUpperCase()}</a>
          <span>{t.brazil}</span>
        </div>
      </div>
    </>
  )
}

export function HomeNavigation() {
  return <NavigationLinks className="hero-navigation" />
}

export function Reveal({ children, className = '', as: Tag = 'div' }) {
  const elementRef = useRef(null)
  const [visible, setVisible] = useState(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    const element = elementRef.current
    if (!element || visible) return undefined

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.unobserve(entry.target)
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [visible])

  return (
    <Tag
      ref={elementRef}
      className={`reveal${visible ? ' is-visible' : ''} ${className}`.trim()}
    >
      {children}
    </Tag>
  )
}

export function Arrow({ direction = 'right' }) {
  return (
    <svg
      className={`arrow arrow--${direction}`}
      viewBox="0 0 48 24"
      aria-hidden="true"
    >
      <path d="M1 12h44M35 2l10 10-10 10" />
    </svg>
  )
}

export function ProjectStrip({ project, index = 0, eager = false }) {
  const { language, t } = useLanguage()
  const [previewing, setPreviewing] = useState(false)
  const canPreview = () =>
    window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const startPreview = () => {
    if (canPreview()) setPreviewing(true)
  }

  return (
    <article className="project-strip">
      <Link
        className={`project-strip__link ${
          index % 2 === 0 ? 'is-left' : 'is-right'
        }`}
        to={`/projeto/${project.slug}`}
        aria-label={`${t.viewProject}: ${project.title}`}
        onMouseEnter={startPreview}
        onMouseLeave={() => setPreviewing(false)}
        onFocus={startPreview}
        onBlur={() => setPreviewing(false)}
      >
        <DeferredImage
          eager={eager}
          className="project-strip__poster"
          src={project.poster}
          alt={localize(project.alt, language)}
          loading={eager ? 'eager' : 'lazy'}
          fetchPriority={eager ? 'high' : 'auto'}
          decoding="async"
          style={{ objectPosition: project.objectPosition }}
          width="1920"
          height="1080"
        />

        {previewing && (
          <AmbientVideo
            className="project-strip__video"
            src={project.video}
            poster={project.poster}
            muted
            loop
            playsInline
            preload="none"
            aria-hidden="true"
            style={{ objectPosition: project.videoPosition || project.objectPosition }}
          />
        )}

        <span className="project-strip__shade" aria-hidden="true" />
        <h2>
          {project.coverLabel && (
            <span>{localize(project.category, language)}</span>
          )}
          {project.title}
        </h2>
        <span className="project-strip__view">
          {t.viewProject} <Arrow />
        </span>
      </Link>
    </article>
  )
}

function getEmbedUrl(film) {
  if (film.provider === 'youtube') {
    return `https://www.youtube-nocookie.com/embed/${film.videoId}?autoplay=1&rel=0&cc_load_policy=1`
  }

  return null
}

function VideoModal({ film, title, onClose }) {
  const closeRef = useRef(null)
  const videoRef = useRef(null)
  const embedUrl = getEmbedUrl(film)
  const { t } = useLanguage()

  useEffect(() => {
    const video = videoRef.current
    if (video && video.getAttribute('src') !== film.video) video.src = film.video
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
      if (video) {
        video.pause()
        video.removeAttribute('src')
        video.load()
      }
    }
  }, [film.video, onClose])

  return createPortal(
    <div
      className="video-modal"
      role="dialog"
      aria-modal="true"
      aria-label={`${title}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <button
        ref={closeRef}
        type="button"
        className="video-modal__close"
        aria-label={t.closePlayer}
        onClick={onClose}
      >
        <span />
        <span />
      </button>
      <div className="video-modal__frame">
        {embedUrl ? (
          <iframe
            src={embedUrl}
            title={title}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <video
            ref={videoRef}
            src={film.video}
            poster={film.poster}
            controls
            autoPlay
            playsInline
            preload="metadata"
          >
            {film.captions && (
              <track
                kind="captions"
                src={film.captions}
                srcLang="pt"
                label="Português"
              />
            )}
          </video>
        )}
      </div>
    </div>,
    document.body,
  )
}

export function FilmPlayer({ film, title }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const closePlayer = useCallback(() => setOpen(false), [])

  return (
    <>
      <button
        type="button"
        className="film-player"
        aria-label={`${t.playFilm} ${title}`}
        onClick={() => setOpen(true)}
      >
        <img
          src={film.poster}
          alt=""
          width="1920"
          height="1080"
          loading="eager"
          fetchPriority="high"
          style={{ objectPosition: film.objectPosition }}
        />
        <span className="film-player__shade" />
        <span className="film-player__play" aria-hidden="true" />
      </button>
      {open && (
        <VideoModal film={film} title={title} onClose={closePlayer} />
      )}
    </>
  )
}

export function PageBanner({
  eyebrow,
  title,
  poster,
  alt = '',
  objectPosition = 'center',
  compact = false,
  tint = false,
}) {
  return (
    <section
      className={`page-banner${compact ? ' page-banner--compact' : ''}${tint ? ' page-banner--tint' : ''}`}
    >
      {poster && (
        <img
          src={poster}
          alt={alt}
          width="1920"
          height="1080"
          fetchPriority="high"
          style={{ objectPosition }}
        />
      )}
      <span className="page-banner__shade" aria-hidden="true" />
      <div className="page-banner__content">
        <span className="page-banner__line" />
        {eyebrow && <p>{eyebrow}</p>}
        <h1>{title}</h1>
      </div>
    </section>
  )
}

export function PageMeta({ title, description }) {
  useEffect(() => {
    document.title = title
    const meta = document.querySelector('meta[name="description"]')
    if (meta && description) meta.setAttribute('content', description)
  }, [description, title])

  return null
}

export function Footer() {
  const { t } = useLanguage()

  return (
    <footer className="site-footer">
      <Link to="/" aria-label="DUUK">
        <Logo />
      </Link>
      <p>{studio.city}</p>
      <p className="site-footer__cnpj">CNPJ {studio.cnpj}</p>
      <div className="site-footer__links">
        <a href={`mailto:${studio.email}`}>{studio.email.toUpperCase()}</a>
        <a href={studio.instagram} target="_blank" rel="noreferrer">
          {t.instagram.toUpperCase()}
        </a>
        <a href={studio.whatsapp} target="_blank" rel="noreferrer">
          {t.whatsapp}
        </a>
      </div>
      <div className="site-footer__bottom">
        <span>© {new Date().getFullYear()} DUUK</span>
        <Link to="/politica-de-privacidade">{t.privacy}</Link>
      </div>
    </footer>
  )
}

export function CreditBar({ project, index = 0 }) {
  const { language, t } = useLanguage()
  const category = localize(project.category, language)

  return (
    <section className="credit-bar">
      <div>
        <span>
          {String(index + 1).padStart(2, '0')} / {t.film}
        </span>
        <h2>{project.title}</h2>
      </div>
      <ul>
        {project.client && project.client !== 'A DEFINIR' && (
          <li>
            {t.client}: {project.client}
          </li>
        )}
        {project.agency && project.agency !== '—' && project.agency !== 'A DEFINIR' && (
          <li>
            {t.agency}: {project.agency}
          </li>
        )}
        {project.director && project.director !== 'A DEFINIR' && (
          <li>
            {t.director}: {project.director}
          </li>
        )}
        <li>{project.year}</li>
        {category && category !== 'A DEFINIR' && category !== 'TO BE DEFINED' && (
          <li>{category}</li>
        )}
      </ul>
    </section>
  )
}

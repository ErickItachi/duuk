import { Link, Navigate, useParams } from 'react-router-dom'
import DeferredImage from '../components/DeferredImage'
import {
  Arrow,
  CreditBar,
  FilmPlayer,
  Footer,
  Header,
  Logo,
  PageBanner,
  PageMeta,
  ProjectIndex,
  Reveal,
} from '../components/Site'
import {
  getAdjacentProjects,
  getProjectBySlug,
  projects,
  studio,
} from '../data/projects'
import { directors } from '../data/directors'
import { privacyPolicy } from '../data/privacy'
import { localize, useLanguage } from '../i18n'

export function PortfolioPage() {
  const { language, t } = useLanguage()

  return (
    <>
      <PageMeta title={t.portfolioTitle} description={t.portfolioDescription} />
      <Header />
      <main id="conteudo">
        <PageBanner
          eyebrow={`${t.nav.portfolio} / 01—${String(projects.length).padStart(2, '0')}`}
          title={t.nav.portfolio}
          poster="/media/poster-portfolio.jpg"
          alt={
            language === 'en'
              ? 'Camera operator filming on set, in black and white'
              : 'Operador de câmera filmando no set, em preto e branco'
          }
          objectPosition="center 38%"
          tint
        />
        <ProjectIndex projects={projects} label={t.nav.portfolio} eagerFirst />
      </main>
      <Footer />
    </>
  )
}

export function ProjectPage() {
  const { slug } = useParams()
  const project = getProjectBySlug(slug)
  const { language, t } = useLanguage()

  if (!project) {
    return <Navigate to="/portfolio" replace />
  }

  const { previous, next } = getAdjacentProjects(project.slug)
  const films = [project, ...(project.films || [])]
  const category = String(localize(project.category, language))
  const eyebrow =
    category && category !== 'A DEFINIR' && category !== 'TO BE DEFINED'
      ? `${category} / ${project.year}`
      : project.year

  return (
    <>
      <PageMeta
        title={`${project.title} — DUUK`}
        description={localize(project.description, language)}
      />
      <Header />
      <main id="conteudo" className="project-page">
        <PageBanner
          eyebrow={eyebrow}
          title={project.title}
          poster={project.poster}
          alt={localize(project.alt, language)}
          objectPosition={project.objectPosition}
          compact
          tint
        />

        {films.map((film, index) => (
          <div key={`${film.slug || project.slug}-${index}`}>
            <section
              className="project-film"
              aria-label={`${t.film} ${film.title || project.title}`}
            >
              <FilmPlayer
                film={film}
                title={film.title || project.title}
              />
            </section>
            <CreditBar project={{ ...project, ...film }} index={index} />
          </div>
        ))}

        <section className="project-story">
          <Reveal className="project-story__intro">
            <span>{t.aboutProject}</span>
            <p>{localize(project.headline || project.description, language)}</p>
          </Reveal>
          <Reveal className="project-credits">
            <p className="project-credits__note">{localize(project.description, language)}</p>
          </Reveal>
        </section>

        <nav className="project-pagination" aria-label={t.nav.portfolio}>
          <Link to={`/projeto/${previous.slug}`}>
            <span>
              <Arrow direction="left" /> {t.previous}
            </span>
            <strong>{previous.title}</strong>
            <DeferredImage src={previous.poster} alt="" loading="lazy" />
          </Link>
          <Link to={`/projeto/${next.slug}`}>
            <span>
              {t.next} <Arrow />
            </span>
            <strong>{next.title}</strong>
            <DeferredImage src={next.poster} alt="" loading="lazy" />
          </Link>
        </nav>
        <Link className="back-to-work" to="/portfolio">
          {t.allProjects} <Arrow />
        </Link>
      </main>
      <Footer />
    </>
  )
}

export function AboutPage() {
  const { t } = useLanguage()

  return (
    <>
      <PageMeta title={t.aboutMetaTitle} description={t.aboutMetaDescription} />
      <Header />
      <main id="conteudo">
        <section className="about-hero">
          <Reveal className="about-hero__copy">
            <p>{t.aboutEyebrow}</p>
            <h1>{t.aboutTitle}</h1>
            <p className="about-hero__body">{t.aboutBody}</p>
          </Reveal>
        </section>

        <section className="about-note">
          <span>{t.aboutEyebrow}</span>
          <div className="about-note__copy">
            {t.aboutStory.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}

export function DirectorPage() {
  const { slug } = useParams()
  const { language } = useLanguage()
  const director = directors.find((item) => item.slug === slug)

  if (!director) return <Navigate to="/sobre" replace />

  const bio = localize(director.bio, language)
  const paragraphs = bio ? bio.split(/\n\n+/).filter(Boolean) : []
  const splitAt = paragraphs.length > 3 ? 2 : Math.ceil(paragraphs.length / 2)
  const opening = paragraphs.slice(0, splitAt)
  const aside = paragraphs.slice(splitAt)
  const [firstName, ...lastName] = director.name.split(' ')

  return (
    <>
      <PageMeta
        title={`${director.display} — DUUK`}
        description={paragraphs[0] || director.display}
      />
      <Header />
      <main id="conteudo">
        <section className="director-stage">
          <div className="director-stage__layout">
            {director.photo ? (
              <img
                className="director-stage__portrait"
                src={director.photo}
                alt={director.display}
              />
            ) : (
              <div
                className="director-stage__portrait director-stage__portrait--empty"
                aria-hidden="true"
              />
            )}
            <div className="director-stage__copy">
              <h1>
                <span>{firstName}</span>
                <span>{lastName.join(' ')}</span>
              </h1>
              {opening.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </div>
          {aside.length > 0 && (
            <div className="director-stage__aside">
              {aside.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          )}
        </section>
      </main>
      <Footer />
    </>
  )
}

export function ContactPage() {
  const { t } = useLanguage()

  const submit = (event) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const name = data.get('name')
    const email = data.get('email')
    const message = data.get('message')
    const subject = encodeURIComponent(`DUUK — ${name}`)
    const body = encodeURIComponent(`${message}\n\n${name}\n${email}`)
    window.location.href = `mailto:${studio.email}?subject=${subject}&body=${body}`
  }

  return (
    <>
      <PageMeta
        title={t.contactMetaTitle}
        description={t.contactMetaDescription}
      />
      <Header />
      <main id="conteudo" className="contact-page">
        <section className="contact-hero">
          <p>{t.available}</p>
          <Reveal>
            <h1>{t.contactTitle}</h1>
          </Reveal>
          <ul className="contact-links">
            <li>
              <a href={`mailto:${studio.email}`}>{studio.email}</a>
            </li>
            <li>
              <a href={studio.instagram} target="_blank" rel="noreferrer">
                {t.instagram}
              </a>
            </li>
            <li>
              <a
                href={studio.whatsapp}
                target="_blank"
                rel="noreferrer"
                aria-label="WhatsApp"
              >
                {t.whatsapp}
              </a>
            </li>
          </ul>
          <form className="contact-form" onSubmit={submit}>
            <label>
              {t.name}
              <input name="name" type="text" autoComplete="name" required />
            </label>
            <label>
              {t.email}
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label>
              {t.message}
              <textarea name="message" rows="4" required />
            </label>
            <button type="submit">{t.send}</button>
          </form>
          <p className="contact-hero__note">{t.contactNote}</p>
        </section>
      </main>
      <Footer />
    </>
  )
}

export function PrivacyPage() {
  const { t, language } = useLanguage()

  return (
    <>
      <PageMeta
        title={`${t.privacyTitle} — DUUK`}
        description={localize(privacyPolicy.description, language)}
      />
      <Header />
      <main id="conteudo" className="legal-page">
        <Reveal>
          <span>{t.legal} / 01</span>
          <h1>{t.privacyTitle}</h1>
          <p className="legal-page__updated">
            {localize(privacyPolicy.updated, language)}
          </p>
          <div className="legal-page__body">
            <p>{localize(privacyPolicy.lead, language)}</p>
            {privacyPolicy.sections.map((section) => (
              <section key={section.title.pt}>
                <h2>{localize(section.title, language)}</h2>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph.pt}>{localize(paragraph, language)}</p>
                ))}
              </section>
            ))}
          </div>
          <Link className="text-link" to="/">
            {t.backHome} <Arrow />
          </Link>
        </Reveal>
      </main>
      <Footer />
    </>
  )
}

export function NotFoundPage() {
  const { t } = useLanguage()

  return (
    <>
      <PageMeta title={`${t.error} — DUUK`} />
      <Header />
      <main id="conteudo" className="not-found">
        <Logo />
        <span>{t.error}</span>
        <h1>{t.notFound}</h1>
        <Link className="text-link" to="/">
          {t.backHome} <Arrow />
        </Link>
      </main>
    </>
  )
}

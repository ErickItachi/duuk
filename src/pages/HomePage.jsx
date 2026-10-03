import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AmbientVideo from '../components/AmbientVideo'
import {
  Arrow,
  Footer,
  Header,
  HomeNavigation,
  Logo,
  PageMeta,
  ProjectStrip,
  Reveal,
} from '../components/Site'
import { heroMedia, projects } from '../data/projects'
import { useLanguage } from '../i18n'

function useNarrowScreen() {
  const query = '(max-width: 800px)'
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  )

  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setNarrow(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return narrow
}

export default function HomePage() {
  const { t } = useLanguage()
  const narrow = useNarrowScreen()
  const hero = narrow
    ? { poster: heroMedia.posterMobile, video: heroMedia.videoMobile }
    : heroMedia

  return (
    <>
      <PageMeta title={t.siteTitle} description={t.siteDescription} />
      <Header home />
      <main id="conteudo">
        <section className="home-hero" aria-label="DUUK">
          <AmbientVideo
            key={hero.video}
            className="home-hero__video"
            poster={hero.poster}
            src={hero.video}
            muted
            loop
            playsInline
            preload="metadata"
            aria-hidden="true"
          />
          <span className="home-hero__overlay" aria-hidden="true" />
          <div className="home-hero__center">
            <Logo className="home-hero__logo" priority />
            <HomeNavigation />
          </div>
        </section>

        <section className="project-index" aria-label={t.nav.portfolio}>
          {projects
            .filter((project) => project.featured)
            .map((project, index) => (
              <ProjectStrip
                key={project.slug}
                project={project}
                index={index}
              />
            ))}
        </section>

        <section className="home-close">
          <Reveal>
            <p>{t.homeClose}</p>
            <Link className="text-link" to="/contato">
              {t.nav.contact} <Arrow />
            </Link>
          </Reveal>
        </section>
      </main>
      <Footer />
    </>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import AmbientVideo from '../components/AmbientVideo'
import YouTubeAmbient from '../components/YouTubeAmbient'
import { heroVideo } from '../content/youtube'
import DeferredImage from '../components/DeferredImage'
import {
  Arrow,
  Footer,
  Header,
  HomeNavigation,
  Logo,
  PageMeta,
  ProjectIndex,
  Reveal,
} from '../components/Site'
import { useContent } from '../content/useContent'
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
  const { siteProjects: projects, siteHero: heroMedia } = useContent()
  const featuredProjects = projects.filter((project) => project.featured)
  const narrow = useNarrowScreen()
  const heroVideoRef = useRef(null)
  const [autoplayBlocked, setAutoplayBlocked] = useState(false)
  const hero = heroVideo(heroMedia, narrow)

  useEffect(() => {
    if (!autoplayBlocked || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    // A blocked browser keeps the poster. Retry within the first ordinary gesture.
    const resume = () => { heroVideoRef.current?.play()?.catch(() => {}) }
    document.addEventListener('pointerdown', resume, { once: true })
    document.addEventListener('keydown', resume, { once: true })
    return () => { document.removeEventListener('pointerdown', resume); document.removeEventListener('keydown', resume) }
  }, [autoplayBlocked])

  return (
    <>
      <PageMeta title={t.siteTitle} description={t.siteDescription} />
      <Header home />
      <main id="conteudo">
        <section className="home-hero" aria-label="DUUK">
          <DeferredImage className="home-hero__poster" src={hero.poster} alt="" eager />
          {hero.provider === 'youtube' ? <YouTubeAmbient key={hero.videoId} videoId={hero.videoId} videoRef={heroVideoRef} onAutoplayBlocked={setAutoplayBlocked} /> : <AmbientVideo
            key={hero.video}
            className="home-hero__video"
            poster={hero.poster}
            src={hero.video}
            videoRef={heroVideoRef}
            priority
            onAutoplayBlocked={setAutoplayBlocked}
            muted
            loop
            playsInline
            preload="auto"
            aria-hidden="true"
          />}
          <span className="home-hero__overlay" aria-hidden="true" />
          <div className="home-hero__center">
            <Logo className="home-hero__logo" priority />
            <HomeNavigation />
          </div>
        </section>

        <ProjectIndex projects={featuredProjects} label={t.nav.portfolio} eagerFirst />

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

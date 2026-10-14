import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import './studio-greeting.css'

// The greeting types itself automatically: no play or pause control. It stops while the tab is
// hidden and stays still, with the first phrase, when the system asks for reduced motion.
const zone = 'America/Sao_Paulo'
const hourFormat = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', hour12: false })
const dateFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: zone, weekday: 'long', day: 'numeric', month: 'long' })
const isoFormat = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' })

const motionQuery = () => window.matchMedia('(prefers-reduced-motion: reduce)')
const subscribeMotion = callback => {
  const query = motionQuery()
  query.addEventListener('change', callback)
  return () => query.removeEventListener('change', callback)
}
const subscribeVisibility = callback => {
  document.addEventListener('visibilitychange', callback)
  return () => document.removeEventListener('visibilitychange', callback)
}
const isHidden = () => document.hidden
const reducedMotion = () => motionQuery().matches

export default function StudioGreeting({ name = '' }) {
  const firstName = name.trim().split(/\s+/)[0] || 'equipe'
  const [clock, setClock] = useState(Date.now)
  const reduced = useSyncExternalStore(subscribeMotion, reducedMotion)
  const hidden = useSyncExternalStore(subscribeVisibility, isHidden)
  const hour = Number(hourFormat.format(clock))
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
  const date = dateFormat.format(clock)
  const phrases = useMemo(() => [
    `Seja bem-vindo, ${firstName}!`,
    'Seu próximo projeto começa aqui.',
    'Boas ideias merecem movimento.',
    'Cada detalhe faz parte do filme.',
  ], [firstName])
  const [step, setStep] = useState({ index: 0, length: 0, deleting: false })
  const phrase = phrases[step.index % phrases.length]
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 60000); return () => clearInterval(timer) }, [])
  useEffect(() => {
    if (reduced || hidden) return
    const full = step.length >= phrase.length
    const timer = setTimeout(() => setStep(old => {
      if (old.deleting) return old.length > 0 ? { ...old, length: old.length - 1 } : { index: (old.index + 1) % phrases.length, length: 0, deleting: false }
      return full ? { ...old, deleting: true } : { ...old, length: old.length + 1 }
    }), step.deleting ? 28 : full ? 4200 : 48)
    return () => clearTimeout(timer)
  }, [step, phrase, phrases.length, reduced, hidden])
  return <div className="studio-greeting">
    <p className="studio-greeting__date"><time dateTime={isoFormat.format(clock)}>{date.charAt(0).toUpperCase() + date.slice(1)}</time></p>
    <h1 className="studio-greeting__title">{greeting}, {firstName}<span className="studio-greeting__dot">.</span></h1>
    <p className="studio-greeting__copy">
      <span className="ds-visually-hidden">{phrases[0]}</span>
      <span aria-hidden="true">{reduced ? phrases[0] : phrase.slice(0, step.length)}<span className={`studio-greeting__cursor${hidden ? ' is-paused' : ''}`} /></span>
    </p>
  </div>
}

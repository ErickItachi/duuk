import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import './studio-greeting.css'

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
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(clock))
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
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
  return <>
    <p className="admin-eyebrow">SEU ESTÚDIO. SUAS HISTÓRIAS.</p>
    <h1>{greeting},<br />{firstName}<span>.</span></h1>
    <div className="studio-greeting">
      <p className="studio-greeting__copy">
        <span className="studio-greeting__accessible">{phrases[0]}</span>
        <span aria-hidden="true">{reduced ? phrases[0] : phrase.slice(0, step.length)}<span className={`studio-greeting__cursor${hidden ? ' is-hidden' : ''}`} /></span>
      </p>
    </div>
  </>
}

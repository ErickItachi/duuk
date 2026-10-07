import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const dictionary = {
  pt: {
    nav: {
      home: 'INÍCIO',
      portfolio: 'PORTFÓLIO',
      about: 'SOBRE',
      contact: 'CONTATO',
    },
    viewProject: 'VER FILME',
    playFilm: 'Reproduzir',
    closePlayer: 'Fechar player',
    openMenu: 'Abrir menu',
    closeMenu: 'Fechar menu',
    language: 'Selecionar idioma',
    client: 'Cliente',
    agency: 'Agência',
    director: 'Direção',
    year: 'Ano',
    category: 'Categoria',
    aboutProject: 'Sobre o filme',
    credits: 'Ficha técnica',
    previous: 'ANTERIOR',
    next: 'PRÓXIMO',
    allProjects: 'PORTFÓLIO',
    film: 'FILME',
    contactTitle: 'FALA COM A DUUK.',
    email: 'E-MAIL',
    instagram: '@duukfilms',
    whatsapp: '(11) 96700-9307',
    name: 'NOME',
    message: 'MENSAGEM',
    send: 'ENVIAR',
    city: 'SÃO PAULO / SP',
    privacy: 'POLÍTICA DE PRIVACIDADE',
    privacyTitle: 'POLÍTICA DE PRIVACIDADE',
    backHome: 'VOLTAR AO INÍCIO',
    notFound: 'CENA CORTADA.',
    aboutEyebrow: 'DUUK / SÃO PAULO',
    aboutTitle: 'O REAL MERECE DEIXAR MARCA.',
    aboutBody:
      'A DUUK é uma produtora audiovisual de São Paulo. Fazemos vídeos para marcas, projetos e momentos — sem se limitar a um único tipo de cliente.',
    aboutStory: [
      'Fundada em 2026 por Erick Borborema e Douglas Felix, a DUUK surgiu da amizade entre os dois e de um objetivo que compartilhavam havia tempos, viver do audiovisual.',
      'O projeto começou a ganhar identidade ainda na escolha do nome. A primeira ideia era Duck, mas os dois buscavam algo mais próprio. Chegaram a DUUK, nome que marcou o início da produtora que decidiram construir juntos.',
    ],
    behindTheScenes: 'BASTIDORES / SET',
    directors: 'DIRETORES',
    directorRole: 'DIRETOR',
    trajectory: 'TRAJETÓRIA',
    vision: 'VISÃO',
    works: 'TRABALHOS',
    pending: 'Pendente.',
    worksPending: 'A publicar.',
    photoPending: 'FOTO A ENVIAR',
    contactNote: 'SÃO PAULO · @DUUKFILMS · (11) 96700-9307',
    formNote: 'O envio abre o e-mail. Backend a definir.',
    homeClose: 'O QUE VEM A SEGUIR?',
    available: 'ABERTOS PARA NOVOS FILMES',
    brazil: 'BRASIL',
    selection: 'SELEÇÃO / 2026',
    disciplines:
      'PUBLICIDADE · FASHION FILM · VIDEOCLIPE · DOCUMENTAL · BRANDED CONTENT',
    legal: 'LEGAL',
    error: 'ERRO / 404',
    skip: 'Ir para o conteúdo',
    siteTitle: 'DUUK — Produtora Audiovisual',
    siteDescription:
      'Produtora audiovisual em São Paulo. Vídeos para marcas, projetos e momentos.',
    portfolioTitle: 'Portfólio — DUUK',
    portfolioDescription:
      'Portfólio da DUUK: filmes para marcas, projetos e momentos.',
    aboutMetaTitle: 'Sobre — DUUK',
    aboutMetaDescription:
      'A DUUK é uma produtora audiovisual de São Paulo. Vídeos para marcas, projetos e momentos.',
    contactMetaTitle: 'Contato — DUUK',
    contactMetaDescription: 'Fala com a DUUK. Abertos para novos filmes.',
  },
  en: {
    nav: {
      home: 'HOME',
      portfolio: 'PORTFOLIO',
      about: 'ABOUT',
      contact: 'CONTACT',
    },
    viewProject: 'VIEW FILM',
    playFilm: 'Play',
    closePlayer: 'Close player',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    language: 'Select language',
    client: 'Client',
    agency: 'Agency',
    director: 'Director',
    year: 'Year',
    category: 'Category',
    aboutProject: 'About the film',
    credits: 'Credits',
    previous: 'PREVIOUS',
    next: 'NEXT',
    allProjects: 'PORTFOLIO',
    film: 'FILM',
    contactTitle: 'TALK TO DUUK.',
    email: 'EMAIL',
    instagram: '@duukfilms',
    whatsapp: '(11) 96700-9307',
    name: 'NAME',
    message: 'MESSAGE',
    send: 'SEND',
    city: 'SÃO PAULO / SP',
    privacy: 'PRIVACY POLICY',
    privacyTitle: 'PRIVACY POLICY',
    backHome: 'BACK TO HOME',
    notFound: 'SCENE CUT.',
    aboutEyebrow: 'DUUK / SÃO PAULO',
    aboutTitle: 'THE REAL SHOULD LEAVE A MARK.',
    aboutBody:
      'DUUK is an audiovisual studio in São Paulo. We make films for brands, projects and moments — not limited to one kind of client.',
    aboutStory: [
      'Founded in 2026 by Erick Borborema and Douglas Felix, DUUK grew out of their friendship and a goal they had shared for a long time: to make a living from audiovisual work.',
      'The project began to take on an identity in the choice of the name. The first idea was Duck, but the two of them were looking for something more their own. They arrived at DUUK, the name that marked the start of the studio they decided to build together.',
    ],
    behindTheScenes: 'BEHIND THE SCENES / SET',
    directors: 'DIRECTORS',
    directorRole: 'DIRECTOR',
    trajectory: 'CAREER',
    vision: 'VISION',
    works: 'WORK',
    pending: 'Pending.',
    worksPending: 'To be published.',
    photoPending: 'PHOTO TO COME',
    contactNote: 'SÃO PAULO · @DUUKFILMS · (11) 96700-9307',
    formNote: 'Submit opens email. Backend to be defined.',
    homeClose: 'WHAT COMES NEXT?',
    available: 'OPEN FOR NEW FILMS',
    brazil: 'BRAZIL',
    selection: 'SELECTION / 2026',
    disciplines:
      'ADVERTISING · FASHION FILM · MUSIC VIDEO · DOCUMENTARY · BRANDED CONTENT',
    legal: 'LEGAL',
    error: 'ERROR / 404',
    skip: 'Skip to content',
    siteTitle: 'DUUK — Audiovisual Studio',
    siteDescription:
      'Audiovisual studio in São Paulo. Films for brands, projects and moments.',
    portfolioTitle: 'Portfolio — DUUK',
    portfolioDescription:
      'DUUK portfolio: films for brands, projects and moments.',
    aboutMetaTitle: 'About — DUUK',
    aboutMetaDescription:
      'DUUK is an audiovisual studio in São Paulo. Films for brands, projects and moments.',
    contactMetaTitle: 'Contact — DUUK',
    contactMetaDescription: 'Talk to DUUK. Open for new films.',
  },
}

const LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(
    () => window.localStorage.getItem('duuk-language') || 'pt',
  )

  useEffect(() => {
    window.localStorage.setItem('duuk-language', language)
    document.documentElement.lang = language === 'en' ? 'en' : 'pt-BR'
  }, [language])

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t: dictionary[language],
    }),
    [language],
  )

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider')
  }
  return context
}

export function localize(value, language) {
  if (
    value &&
    typeof value === 'object' &&
    ('pt' in value || 'en' in value)
  ) {
    return value[language] || value.pt || ''
  }
  return value
}

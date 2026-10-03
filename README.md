# DUUK — site audiovisual

Site institucional e portfólio da DUUK, em React e Vite.

## Vídeos e Git LFS

Os arquivos MP4 são versionados com [Git LFS](https://git-lfs.com/) para preservar os vídeos originais e permitir o envio ao GitHub. Instale o Git LFS antes de clonar ou enviar alterações.

```bash
git lfs install
git lfs pull
```

Ao configurar uma hospedagem, habilite o download dos arquivos LFS antes de executar o build.

## Rodar localmente

```bash
npm install
npm run dev
```

## Trocar conteúdo

- Projetos, créditos, posters e vídeos: `src/data/projects.js`
- Textos PT/EN: `src/i18n.jsx`
- E-mail e redes: `studio` em `src/data/projects.js`
- Logo branca transparente: `public/media/duuk-logo-white.png`
- Posters e fotos: `public/media/`
- Fontes locais e licenças: `public/fonts/`

O player aceita MP4 e YouTube. Para YouTube, use `provider: "youtube"` e `videoId`. Para MP4, use `provider: "mp4"` e a URL em `video`.

Para mais de um filme no mesmo projeto, adicione `films: [{ title, poster, video, provider, ... }]`.

## Desempenho

A página inicial carrega primeiro; as páginas internas são carregadas sob demanda e antecipadas quando o usuário interage com um link. As fontes ficam no próprio site, sem depender de uma requisição ao Google Fonts.

Os vídeos de fundo e de prévia pausam quando saem da tela ou a aba fica oculta. As imagens dos projetos usam carregamento preguiçoso e as faixas fora da tela adiam a renderização. Os filmes mantêm seus arquivos, resolução e áudio originais; os JPEGs foram otimizados sem alterar os pixels.

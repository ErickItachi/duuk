# DUUK — site audiovisual

Site institucional e portfólio da DUUK, em React e Vite.

## Vídeos e Git LFS

Os vídeos originais ficam em `media/originals/` e são preservados com [Git LFS](https://git-lfs.com/). Para baixar os originais e gerar novas versões, instale o Git LFS:

```bash
git lfs install
git lfs pull
```

O site usa as versões otimizadas de `public/media/video/`, armazenadas diretamente no Git. A Vercel pode fazer o build sem baixar os originais do LFS.

Para atualizar vídeos ou capas, instale [FFmpeg](https://ffmpeg.org/), mantenha os originais em `media/originals/` e as imagens em `public/media/`, e execute:

```bash
npm run media:optimize
```

Esse comando gera filmes completos para desktop e mobile, clipes silenciosos de oito segundos para as prévias, capas WebP responsivas e `src/data/media.generated.json`. Os nomes dos arquivos incluem um hash para permitir cache duradouro sem servir uma versão antiga após uma atualização.

As aberturas têm versões HLS em 1080p, 720p e 480p, com segmentos alinhados de dois segundos, e MP4s de reserva. Para atualizar apenas as aberturas, execute `npm run media:optimize -- --heroes`.

## Rodar localmente

```bash
npm install
npm run dev
```

## Trocar conteúdo

- Projetos, créditos e referências dos vídeos e posters: `src/data/projects.js`
- Vídeos originais: `media/originals/`
- Vídeos web e prévias: `public/media/video/`
- Textos PT/EN: `src/i18n.jsx`
- E-mail e redes: `studio` em `src/data/projects.js`
- Logo branca transparente: `public/media/duuk-logo-white.png`
- Posters e fotos: `public/media/`
- Fontes locais e licenças: `public/fonts/`

O player aceita MP4 e YouTube. Para YouTube, use `provider: "youtube"` e `videoId`. Para MP4, use `provider: "mp4"` e a URL em `video`.

Para mais de um filme no mesmo projeto, adicione `films: [{ title, poster, video, provider, ... }]`.

## Desempenho

A página inicial carrega primeiro; as páginas internas são carregadas sob demanda e antecipadas quando o usuário interage com um link. As fontes ficam no próprio site, sem depender de uma requisição ao Google Fonts.

As capas usam WebP com tamanhos de 640, 1280 e 1920 pixels, escolhidos pelo navegador, e carregamento nativo antecipado para as primeiras imagens. As prévias usam clipes curtos em vez dos filmes completos. No mobile, apenas a prévia mais visível pode tocar por vez; economia de dados e redução de movimento desativam essas prévias automáticas.

Os vídeos usam H.264 de 8 bits e metadados no início do MP4 para começar antes de baixar o arquivo inteiro. O player escolhe a versão mobile em telas pequenas ou dispositivos de toque e inicia a reprodução diretamente no clique. Vídeos de fundo e prévias pausam fora da tela, com a aba oculta ou enquanto um filme está aberto. Se o navegador bloquear o autoplay da capa, um botão permite iniciar o vídeo.

A abertura mantém uma versão de alta qualidade em 1080p, codificada em CRF 18, nos formatos horizontal e vertical. O HLS escolhe a qualidade conforme a velocidade medida da conexão e busca somente alguns segundos à frente. Safari usa seu suporte nativo; os outros navegadores compatíveis carregam o player HLS sob demanda, com processamento de vídeo em um worker. Na economia de dados ou se HLS não estiver disponível, o site usa MP4 progressivo. Os filmes dos projetos continuam com versões próprias para desktop e mobile.

Os arquivos originais, com sua resolução e áudio, continuam preservados no LFS. O build inclui apenas as versões web. A entrada do site não espera por uma animação de carregamento com duração fixa.

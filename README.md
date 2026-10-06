# DUUK — site audiovisual

Site institucional e portfólio da DUUK, em React e Vite.

## Painel administrativo em preview

O painel está na branch `preview/admin-panel`. Enviar essa branch ao GitHub gera um preview separado na Vercel. Não faça merge em `main` para testar: `main` publica no domínio oficial.

Abra `/admin` no endereço do preview para editar projetos, reordenar filmes, trocar vídeos e capas e configurar a abertura para desktop e celular. **Salvar rascunho** preserva o conteúdo para revisão; **Ver site** abre o rascunho; **Publicar no preview** aplica o rascunho à versão publicada da demonstração. Para ver essa versão, abra `/?preview=published`.

Esta etapa usa dados de demonstração, sem conexão ao Supabase e sem login real. Conteúdo e arquivos enviados ficam no IndexedDB do navegador, vinculados ao endereço do preview. Eles sobrevivem ao recarregamento, mas não são compartilhados com outras pessoas ou outros endereços de preview. A biblioteca permite enviar imagens e vídeos de até 250 MB por arquivo. Os vídeos enviados ainda não passam por conversão ou geração automática de HLS.

Use **Restaurar demonstração** para apagar as edições e os uploads locais e recuperar os projetos originais. Novas versões do mesmo preview de branch mantêm os dados desse endereço; previews de commits diferentes têm endereços diferentes.

O build desabilita a rota de admin e os dados de demonstração quando `VERCEL_ENV=production`. Previews e builds locais recebem `noindex`. O painel deve permanecer em preview até o usuário aprovar a integração com um Supabase de testes e, posteriormente, a publicação em produção.

```bash
npm run test
npm run dev
```

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

As aberturas têm versões HLS em 4K, 1080p, 720p e 480p, com segmentos alinhados de dois segundos, e MP4s de reserva em 1080p e 720p. Para atualizar apenas as aberturas, execute `npm run media:optimize -- --heroes`. Para adicionar a versão 4K preservando as versões menores já geradas do mesmo original, use `npm run media:optimize -- --heroes-4k`.

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

A abertura inclui versões 4K em 3840×2160 no desktop e 2160×3840 no mobile, codificadas em CRF 18. Os originais disponíveis são 1080p: as versões 4K usam ampliação Lanczos e não equivalem a uma gravação nativa em 4K. A versão 4K é distribuída apenas em segmentos HLS, mantendo cada arquivo abaixo do limite do GitHub e as reservas MP4 em 1080p. O HLS escolhe a qualidade conforme a velocidade medida da conexão e busca somente alguns segundos à frente. Safari usa seu suporte nativo; os outros navegadores compatíveis carregam o player HLS sob demanda, com processamento de vídeo em um worker. Na economia de dados ou se HLS não estiver disponível, o site usa MP4 progressivo. Os filmes dos projetos continuam com versões próprias para desktop e mobile.

Os arquivos originais, com sua resolução e áudio, continuam preservados no LFS. O build inclui apenas as versões web. A entrada do site não espera por uma animação de carregamento com duração fixa.

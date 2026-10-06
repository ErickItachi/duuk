# DUUK — site audiovisual

Site institucional e portfólio da DUUK, em React e Vite.

## Painel administrativo publicado

O painel fica em https://www.duukfilms.com/admin, protegido por login. O site público não mostra links para o painel. A conta administrativa é `contato@duukfilms.com`; a senha está apenas no Supabase Auth.

**Salvar no site** grava o conteúdo e atualiza a versão pública numa transação. Reordenar ou remover um projeto também atualiza o site ao confirmar a ação. Projetos com estado rascunho ou arquivado ficam privados. A atualização chega às páginas abertas por Supabase Realtime; recarregar também carrega os dados atuais.

O projeto Supabase existente (`ilohuxhyfqikjlvoarts`, nome DUUK Preview) passou a atender este site por autorização do usuário. Ele permanece no plano gratuito. Não há contratação de plano, armazenamento ou transcodificação pagos.

### Vídeos e imagens gratuitos

O painel aceita links do YouTube em projetos e nas aberturas desktop/mobile. Envie o vídeo pelo YouTube, escolha visibilidade não listado, permita incorporação e cole o link no painel. Esse vídeo não consome o armazenamento do Supabase. O YouTube pode exibir sua marca e anúncios, conforme aceito pelo usuário; a incorporação precisa ser permitida pelo vídeo.

Uploads diretos continuam disponíveis para imagens JPG, PNG, WebP, AVIF e vídeos MP4/WebM. Limites: 50 MB por arquivo, 1 GB de armazenamento no plano gratuito, além das cotas de tráfego. Fotos maiores que 1 MB são otimizadas para WebP até 2560 px quando a conversão reduz o tamanho. Vídeos maiores que 6 MB usam envio retomável. O site não transcodifica vídeos enviados.

Não existe promessa de hospedagem ilimitada grátis. Os arquivos originais do site seguem no próprio projeto e não ocupam o espaço de uploads do Supabase. Consulte os [limites gratuitos](https://supabase.com/pricing); projetos gratuitos podem pausar por inatividade.

### Dados e segurança

`src/content/supabaseConfig.json` contém apenas URL e chave publishable, próprias para o navegador. Overrides opcionais: `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. Nunca use chaves de serviço nesses valores.

RLS protege o conteúdo, a biblioteca, os arquivos e a tabela de administradores. Os RPCs autorizam administradores no servidor. A publicação filtra os projetos privados antes de liberar JSON aos visitantes; arquivos em uso não podem ser apagados. Revisões impedem sobrescrever uma edição feita em outra aba. `supabase/schema.sql` registra o esquema inicial e `supabase/live.sql` a publicação automática e o Realtime; esses arquivos já foram aplicados.

A função temporária usada para criar a conta foi desativada e retorna 410. O aviso restante do Supabase é a [checagem de senhas vazadas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), disponível apenas no plano Pro.

Use Node.js 22:

```bash
npm ci
npm test
npm run dev
```

Testes remotos rodam quando `DUUK_TEST_PASSWORD` é fornecida no ambiente, sem gravar a senha no projeto.

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

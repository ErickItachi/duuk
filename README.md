# DUUK — site audiovisual

Site institucional e portfólio da DUUK, em React e Vite.

## Painel administrativo em preview

O painel está na branch `preview/admin-panel`, separado do domínio público. Enviar essa branch gera um preview na Vercel. Não faça merge em `main` para testar.

- Painel: https://duuk-git-preview-admin-panel-duuk1.vercel.app/admin
- Supabase: DUUK Preview (`ilohuxhyfqikjlvoarts`), na organização do usuário, região São Paulo.
- Login administrativo: `contato@duukfilms.com`. A senha está somente no Supabase Auth, nunca no repositório.

O painel permite editar projetos, textos PT/EN, ordem, visibilidade, capas, vídeos e abertura para desktop/celular. **Salvar rascunho** grava na nuvem; **Ver site** abre `/?preview=draft` para administradores; **Publicar no preview** atualiza a versão acessível a visitantes em todos os dispositivos. Nada disso publica no domínio oficial.

Imagens e vídeos ficam em um bucket privado. Cada arquivo pode ter até **50 MB**, limite do Supabase gratuito. Vídeos acima de 6 MB usam envio retomável com progresso e novas tentativas. Para vídeos maiores, use HTTPS ou YouTube. O player reproduz o arquivo enviado; não há transcodificação automática. Os arquivos originais do site continuam no próprio projeto.

`duuk_content` separa rascunho e publicação. A publicação remove projetos com estado rascunho/arquivado antes de liberar o JSON aos visitantes. RLS protege conteúdo, biblioteca e arquivos; uma tabela de administradores controlada pelo servidor autoriza edições. Arquivos em uso não podem ser apagados. Revisões impedem sobrescrever uma edição feita em outra aba. Recarregar ou abrir em outro navegador recupera os dados da nuvem; abas abertas verificam atualizações a cada 30 segundos e ao voltar ao foco.

`src/content/supabaseConfig.json` contém somente a URL e a chave **publishable**, próprias para o navegador. Overrides locais opcionais: `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. Não use `service_role` nesses valores. `supabase/schema.sql` documenta a configuração inicial aplicada; não execute novamente num banco já configurado. A conta foi criada pelo Auth Admin API por uma função temporária com autenticação própria; essa função foi desativada após a criação e agora exige JWT e retorna 410.

A auditoria do Supabase não encontrou tabelas expostas sem RLS. O aviso restante é a [checagem de senhas vazadas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), disponível apenas no plano Pro. O projeto permanece gratuito, conforme autorizado.

O build com `VERCEL_ENV=production` desabilita a conexão cloud e a rota `/admin`. Preview e desenvolvimento recebem `noindex`. A produção só será integrada após autorização posterior.

Use Node.js 22:

```bash
npm ci
npm test
npm run dev
```

O teste remoto de permissões e conflitos roda quando `DUUK_TEST_PASSWORD` é fornecida no ambiente, sem gravá-la em arquivos do projeto.

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

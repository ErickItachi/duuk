# DUUK — site audiovisual

Site institucional e portfólio da DUUK, em React e Vite.

## Administrativo publicado

O painel fica em https://www.duukfilms.com/admin, protegido por login. O site público não mostra links para o painel. A conta administrativa é `contato@duukfilms.com`; a senha está apenas no Supabase Auth.

O visual do administrativo segue a DUUK: logo original, Inter/Inter Tight, preto, off-white e acentos coral/laranja do site. O menu se recolhe em tablets e celulares; campos maiores, cards adaptáveis e modais com rolagem acomodam telas desde 320 px e orientação horizontal. Os formulários usam fontes de 16 px no celular para evitar o zoom automático do iOS.

**Salvar no site** grava o conteúdo e atualiza a versão pública numa transação. Reordenar ou remover um projeto também atualiza o site ao confirmar a ação. Projetos com estado rascunho ou arquivado ficam privados. A atualização chega às páginas abertas por Supabase Realtime; recarregar também carrega os dados atuais.

O projeto Supabase existente (`ilohuxhyfqikjlvoarts`, nome DUUK Preview) passou a atender este site por autorização do usuário. Ele permanece no plano gratuito. Não há contratação de plano, armazenamento ou transcodificação pagos.

### Módulos

- `/admin`: visão geral com despesas do mês, contratos pendentes e atividade dos últimos 30 dias.
- `/admin/portfolio`, `/admin/inicio`, `/admin/midias`: projetos, abertura e biblioteca, com publicação ao salvar.
- `/admin/contratos`: PDFs privados, preparação de campos e acompanhamento das duas assinaturas.
- `/admin/despesas`: cadastro, edição, exclusão, categorias, vencimentos, pagamentos e exportação CSV. Totais e filtros usam o mês do vencimento; valores são armazenados em centavos.
- `/admin/insights`: visualizações de páginas, aberturas de filmes e cliques de contato, com filtros de 7, 30 ou 90 dias. Abertura de filme conta um clique no player, não tempo assistido nem conclusão do vídeo.

### Contratos e assinaturas

Envie um PDF pronto de até **10 MB e 30 páginas**, sem senha, informe cliente e representante da DUUK e posicione os campos sobre as páginas. São permitidos até 30 campos: assinatura desenhada, nome, data e texto. Cada participante precisa de ao menos um campo de assinatura. Nome e data são preenchidos com os dados registrados na assinatura; campos de texto são preenchidos pelo participante.

Salve os campos e gere um link para o cliente e outro para a DUUK. Cada link dura **sete dias**; gerar outro para a mesma pessoa invalida o anterior, enquanto ela ainda não assinou. Copie o link no momento da criação: apenas seu hash é guardado, e o painel não recupera o token depois. O administrador compartilha os links manualmente; o sistema não envia e-mails. O e-mail opcional do cliente serve para organização interna.

Depois de gerar links, o PDF e os campos ficam bloqueados. Para corrigir um documento ainda sem assinaturas, cancele os links, exclua o contrato e envie o PDF corrigido. Contratos concluídos e assinaturas recebidas são preservados. Cancelar um contrato parcialmente assinado revoga os links e mantém as evidências; o painel permite gerar novamente seu PDF caso necessário.

Cada participante lê o PDF, informa seu nome, preenche seus campos de texto, desenha a assinatura e confirma o aceite. O PDF baixado inclui as assinaturas recebidas e uma página de registro. O administrativo também exporta JSON com consentimento, nome informado, data, IP, navegador e hashes SHA-256. As duas assinaturas podem acontecer ao mesmo tempo: o servidor preserva ambos os registros e gera a versão final. Reenvios não alteram uma assinatura já registrada.

É **assinatura eletrônica por aceite e desenho, sem certificado ICP-Brasil**. O acesso se dá pelo link privado: qualquer pessoa que o possua pode assinar, sem verificação de identidade por documento, certificado ou e-mail. Não é uma integração com plataforma de assinatura certificada. Os PDFs ficam no bucket privado `duuk-documents`; links de download expiram em dois minutos e são renovados quando o documento é aberto ou baixado. Contratos e evidências ficam guardados até uma ação administrativa aplicável, sem exclusão automática de documentos assinados.

### Insights e privacidade

A medição começa com esta publicação, sem histórico inventado. Armazena totais diários por página, evento, tipo de dispositivo e origem agrupada; não mede visitantes únicos. Não usa cookies de analytics, exclui administradores autenticados e rotas do painel/assinatura, ignora robôs conhecidos e respeita Global Privacy Control. Uma chave de limitação derivada do IP e renovada diariamente fica por menos de dois dias; o IP não entra nos totais de navegação.

Os totais ficam por 90 dias. `supabase/office-retention.sql` registra a limpeza diária via Supabase Cron às 00:15 de São Paulo. As informações de privacidade no site descrevem essa coleta e os dados dos contratos.

### Vídeos e imagens gratuitos

O painel aceita links do YouTube em projetos e nas aberturas desktop/mobile. Envie o vídeo pelo YouTube, escolha visibilidade não listado, permita incorporação e cole o link no painel. Esse vídeo não consome o armazenamento do Supabase. O YouTube pode exibir sua marca e anúncios, conforme aceito pelo usuário; a incorporação precisa ser permitida pelo vídeo.

Uploads diretos continuam disponíveis para imagens JPG, PNG, WebP, AVIF e vídeos MP4/WebM. Limites: 50 MB por arquivo, 1 GB de armazenamento no plano gratuito, além das cotas de tráfego. Fotos maiores que 1 MB são otimizadas para WebP até 2560 px quando a conversão reduz o tamanho. Vídeos maiores que 6 MB usam envio retomável. O site não transcodifica vídeos enviados.

Não existe promessa de hospedagem ilimitada grátis. Os arquivos originais do site seguem no próprio projeto e não ocupam o espaço de uploads do Supabase. Consulte os [limites gratuitos](https://supabase.com/pricing); projetos gratuitos podem pausar por inatividade.

PDFs originais e PDFs com assinaturas **compartilham o 1 GB de Storage** com os uploads de imagens e vídeos. O banco também tem sua cota gratuita, assim como tráfego e execuções das funções. Não há cobrança ou troca de plano configurada por este projeto.

### Dados e segurança

`src/content/supabaseConfig.json` contém apenas URL e chave publishable, próprias para o navegador. Overrides opcionais: `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. Nunca use chaves de serviço nesses valores.

RLS protege o conteúdo, a biblioteca, os arquivos e a tabela de administradores. Os RPCs autorizam administradores no servidor. A publicação filtra os projetos privados antes de liberar JSON aos visitantes; arquivos em uso não podem ser apagados. Revisões impedem sobrescrever uma edição feita em outra aba. `supabase/schema.sql` registra o esquema inicial e `supabase/live.sql` a publicação automática e o Realtime; esses arquivos já foram aplicados.

`supabase/office.sql` registra os contratos, despesas, métricas, políticas e RPCs do administrativo; `office-render.sql` permite preservar o PDF recebido quando um cancelamento ocorre durante sua geração. Esses arquivos e `office-retention.sql` já foram aplicados ao projeto conectado. As tabelas de convites e assinaturas e os RPCs de negócio são exclusivos de `service_role`, acessíveis apenas pelas funções do servidor. Despesas usam RLS de administrador e controle de revisão.

As funções em `supabase/functions/` foram publicadas: `duuk-office` exige JWT, valida a sessão no Supabase Auth e confere a participação administrativa; `duuk-sign` autentica pelo token privado aleatório de 256 bits e valida seu hash, expiração e revogação; `duuk-metrics` aceita apenas eventos públicos validados, com limitação temporária derivada do IP. As duas últimas não exigem JWT por terem esses fluxos próprios. Chaves de serviço ficam exclusivamente no ambiente do Supabase.

PDF-lib 1.17.1 monta os PDFs no servidor. PDF.js 6.4.299 usa o build legado com worker próprio para exibir documentos também em navegadores sem as APIs mais recentes de `Uint8Array`. O PDF é carregado como dados binários, com avaliação de código e WASM desativados. As páginas do painel e dos links têm `noindex`; isso complementa o controle de acesso, sem substituí-lo.

A função temporária usada para criar a conta foi desativada e retorna 410. O aviso restante do Supabase é a [checagem de senhas vazadas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), disponível apenas no plano Pro.

Use Node.js 22:

```bash
npm ci
npm test
npm run dev
```

Testes remotos rodam quando `DUUK_TEST_PASSWORD` é fornecida no ambiente, sem gravar a senha no projeto.

Validação desta ampliação: testes de valores e CSV, integração de autorização/RLS e revisões, testes remotos de upload privado e assinaturas simultâneas, PDF final com hash e evidências, cancelamento e testes de navegador em desktop/mobile. Para conferir as funções, execute `deno check supabase/functions/{duuk-office,duuk-sign,duuk-metrics}/index.ts`.

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

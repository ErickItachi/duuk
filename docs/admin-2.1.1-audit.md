# DUUK Admin 2.1.1 — auditoria e contratos

Auditoria de 14/10/2026 sobre `duuk-admin-live`, branch `feature/duuk-platform`, incorporando a versão 2.1 do Claude (`c43f9e1`). O checkout original `duuk` foi preservado. Não houve contratação, mudança de plano, alteração de credenciais ou exclusão de dados.

## Segurança

Foram revisados rotas públicas/administrativas, sessão, permissões por módulo, Edge Functions, políticas do banco e Storage, contratos, cache PWA, cabeçalhos e integrações oficiais existentes.

| Achado | Correção |
| --- | --- |
| A permissão Equipe permitia tentar atribuir grupo superior ou assumir conta mais privilegiada por senha/e-mail | Limite de administração por permissões efetivas, com exceções individuais e contas inativas. Gerenciamento explícito de permissões e super administradores preservados. |
| O HTML devolvido pela PWA perdia os cabeçalhos definidos na Vercel | Cabeçalhos de segurança incorporados à resposta do worker, com CSP do Admin e `no-referrer`. |
| CSP permitia conexões HTTPS arbitrárias nas telas privadas | `connect-src` do Admin e assinatura restrito ao domínio e aos hosts oficiais do projeto Supabase, TUS e Realtime. Site público conserva compatibilidade com mídias externas. |
| Cadastro público do Auth estava habilitado sem fluxo público de cadastro | Desativado pela configuração oficial do Supabase. Endpoint público de settings confirmou `disable_signup=true`; login existente e criação administrativa preservados. Login anônimo e vinculação manual continuam desligados. |
| Falha de rede durante logout precisava de encerramento local explícito | Limpeza das credenciais do navegador, encerramento de canais e recarga da tela de acesso quando offline. Preferências preservadas; sem alegar revogação remota. Desativação do push local é tentada mesmo se o backend falhar. |
| Leituras e geração de PDF podiam ser repetidas sem limite específico | Limites persistidos na RPC existente: 120 leituras/minuto e 30 alterações/minuto por administrador, dez uploads/minuto; 60 leituras e 20 outras chamadas/minuto por convite; três recuperações de PDF/minuto por contrato. OTP conserva limites próprios. |

Catálogo remoto: **67/67 tabelas com RLS** (50 em `public`, 17 em `duuk_private`), nenhum SELECT anônimo/autenticado nas tabelas privadas, cinco buckets não públicos e nove policies de Storage. SELECT anônimo se limita ao conteúdo e mídia com policies de publicação. Nenhuma função SECURITY DEFINER pública está liberada para `anon`; RPCs de assinatura, geração, credenciais e permissões continuam exclusivas do servidor.

Advisor sem ERROR. Os nove avisos sobre funções SECURITY DEFINER autenticadas correspondem a RPCs intencionais com autorização interna; as tabelas privadas sem policy são bloqueadas deliberadamente. A proteção de senhas vazadas do Supabase continua desativada porque exige recurso de plano pago. Nenhum plano foi ampliado. Varredura dos 596 arquivos rastreados examinados não encontrou chave privada, service role JWT, `sb_secret`, chave Google real ou PEM privado. `npm audit --omit=dev`: zero vulnerabilidades reportadas.

## Contratos e aceite

- O editor mostrava sempre o original. Agora escolhe o assinado atual quando há assinatura, permite alternar para o original e usa a contagem real de páginas do PDF, incluindo as evidências.
- A página privada também mostra o PDF após assinar. URLs inacessíveis ou revogadas ocultam imediatamente o documento anterior; PDFs e provas não entram em Cache Storage ou localStorage.
- Downloads renovam a autorização e usam URL assinada validada, com a opção oficial de attachment do Storage. A janela é aberta durante o toque; quando bloqueada, aparece um link temporário para um segundo toque, sem abandonar o formulário ou descartar campos pendentes.
- Geração interrompida após a assinatura transacional pode ser recuperada em uma leitura autorizada. Só a revisão atual é entregue. Se a geração falhar, a assinatura continua registrada e a tela permite tentar novamente. Arquivos anteriores não são sobrescritos e nenhuma nova assinatura é solicitada.
- Aceite, campos, desenho e confirmação de e-mail continuam obrigatórios conforme o convite. A tela explica as evidências; datas aparecem em Brasília. Novos PDFs preservam o texto efetivamente registrado de consentimento e exibem horário local e UTC. Não há certificado ICP-Brasil ou promessa de identificação civil.
- Produção autenticada confirmou acesso HTTP 200 a PDFs reais concluído e parcial. A revisão pendente foi recuperada. As contagens e os fingerprints dos originais e registros de assinatura permaneceram iguais antes/depois; nenhuma assinatura de teste real foi criada.

Backend instalado separadamente: `duuk-team` **v7**, `duuk-office` **v10**, `duuk-sign` **v7**, todas ACTIVE. As dependências relativas foram incluídas e o código remoto anterior foi comparado com o checkout antes da substituição. Não houve mudança de schema ou reaplicação de migrações. Auth, Vault, Calendar, Drive, Titan, Pluggy, IA e Social Media conservam suas integrações e regras anteriores.

## Visual

Banner editorial PT/EN na home, laranja discreto, CTA para portfólio, banner da Visão geral e movimento da versão 2.1 preservados e refinados. Efeitos contínuos caros foram substituídos por animações com transform. Movimento reduzido também desativa pseudo-elementos do loader. Logo original, vídeos, navegação e convite público foram mantidos; nenhuma referência ao Admin foi adicionada ao site.

## Validação

- Node 22: 200 testes, **199 aprovados e um opt-in anterior ignorado**. Lint mantém somente três avisos anteriores; build de produção aprovado, com aviso já existente de chunks acima de 500 kB.
- Deno: type check das três funções e seis testes de geração, paginação de evidências, recuperação, falha e limite aprovados.
- Fixture SQL de confirmação de e-mail/assinatura passou com rollback: grants/RLS, destinatário fixo, legado, reenvio, tentativas, expiração, revogação, provas, evidências e idempotência. Sem SMTP, mensagens ou assinaturas reais.
- 41 casos visuais e três de loader aprovados entre 320 e 1440 px, temas claro/escuro e home PT/EN. Testes adicionais de contratos cobrem aceite/desenho, OTP, páginas de evidência, revisão pendente, revogação, janela bloqueada e rascunho preservado.
- Logout offline testado com SDK real e backend isolado. Leitura de e-mail em iframe permanece compatível com a CSP.
- Produção: oito tabelas privadas e oito Edge Functions recusaram chamadas anônimas. Também foram verificados método inválido, JSON malformado, origem não permitida, tamanho excessivo e token inválido, além das RPCs privadas.

Artefatos locais de teste ficam fora do repositório. O fluxo de publicação envia para `origin/main`, aguarda sucesso da Vercel e compara `/admin-version.json`, build do worker e páginas do domínio com a versão 2.1.1 antes de anunciar disponibilidade. O hash normaliza `vercel.json` porque a Vercel compacta esse arquivo antes do build; alterações somente de formatação não criam diferenças entre o build local e o publicado.

## Limites da verificação

Não foram enviados e-mails/push, publicados conteúdos sociais ou executadas novas assinaturas reais para testar. Os testes móveis usam Chrome com viewport/toque simulados; o download deve ser conferido também em um iPhone físico. As proteções da aplicação e os limites gratuitos dos provedores não equivalem a garantia contra qualquer ataque volumétrico. Nenhum serviço pago ou CAPTCHA externo foi ativado.

Referências oficiais: [configuração do Auth](https://supabase.com/docs/guides/auth/general-configuration), [acesso privado e downloads do Storage](https://supabase.com/docs/guides/storage/serving/downloads), [URLs assinadas](https://supabase.com/docs/reference/javascript/storage-from-createsignedurl). O changelog relevante de [TLS](https://supabase.com/changelog/cbc-tls-ciphers-deprecated) foi conferido; as conexões atuais usam TLS validado, sem desativar certificados.

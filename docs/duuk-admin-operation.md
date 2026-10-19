# Operação do DUUK PAINEL ADMINISTRATIVO

## Cobranças, consultas e permissões — 2.7.0

Asaas central: simulador oficial, taxas vigentes, saldo/estatísticas, extrato CSV e consultas de clientes, cobranças, parcelamentos e assinaturas. Edição de descrição/vencimento, restauração e Pix/boleto preservam a conferência canônica. Saques continuam bloqueados. Dashboard inclui Asaas e Spotify pessoal. `billing` e `spotify` agora são independentes, configuráveis em Grupos de acesso e Permissões individuais, com acessos anteriores preservados. Deploy backend: duuk-billing v3 e duuk-spotify v8. Escopo, validação e limitações em [asaas-billing-setup.md](asaas-billing-setup.md#expansão-de-cobranças-e-consultas--270--19102026).

## Spotify pessoal — 2.5.1

Cada membro conecta a própria conta em Seu espaço > Spotify. Configuração, limites, recursos e privacidade: [spotify-setup.md](spotify-setup.md). A música usa o Web Playback SDK oficial para faixas completas com Premium, com ativação de áudio no iPhone e escolha dos próprios dispositivos via API; o Spotify define disponibilidade/Premium e até cinco contas no aplicativo atual. O novo botão da IA permanece movível, com nome visível e proteção dos formulários.

## Segurança e acesso — 2.4.0

Toda a equipe usa senha e TOTP gratuito, conforme escolha do proprietário em 16/10/2026. No primeiro acesso, adicione a DUUK ao autenticador e confirme o código antes de abrir os módulos. Configurações > Segurança permite cadastrar outro autenticador, preserva o último e oferece encerrar outras sessões sem sair do aparelho atual. Guarde a chave em local seguro; sem nenhum fator, a recuperação precisa do gerenciamento oficial do Supabase pelo proprietário, sem bypass por e-mail/senha.

RLS e Edge Functions verificam a sessão atual e o fator, bloqueando tokens de sessões encerradas antes da expiração. Migração, evidências, custos, limites e cuidados de recuperação estão em [security-audit-2026-10-16.md](security-audit-2026-10-16.md). Não ative proteção de senhas vazadas paga para eliminar o aviso do advisor. PWA já instalada deve receber atualização explícita; preserve formulários pendentes.

## Refinamentos, notificações e e-mail — 2.3.0

Painel fixo da IA, cores financeiras, carregamento clean, som no app, avisos transacionais por módulo, foto da caixa comercial e HTML dos códigos de contrato: [admin-2.3-validation.md](admin-2.3-validation.md). `duuk-sign` v8 e migração `20261015062459_duuk_notifications_resources` publicados separadamente do frontend. O som com o app fechado continua sob controle do sistema; nenhum push ou e-mail real é necessário para validar o visual.

Sobre mantém consulta e atualização explícita, sem notas, histórico ou janela de novidades. A instalação da PWA usa o mesmo loader mínimo e não descarta formulários pendentes.

## Visão geral e IA — 2.2.0

Foto de bastidores no banner, métricas reais por permissão e janela da IA adaptada ao teclado mobile: [admin-2.2-validation.md](admin-2.2-validation.md). O botão flutuante desaparece enquanto qualquer diálogo estiver aberto. Foco por teclado usa preenchimento/sublinhado, sem molduras adicionais; botões secundários e seleções seguem a mesma preferência do usuário.

## Segurança e contratos — 2.1.1

Auditoria, correções, limites e validação: [admin-2.1.1-audit.md](admin-2.1.1-audit.md). Novas contas são criadas pelo administrativo; signup público está desabilitado. O PDF assinado atual abre por padrão, com opção de original e recuperação da geração pendente. Downloads renovam o acesso privado; se a janela for bloqueada, use o link preparado na própria tela. No iPhone, o visualizador pode oferecer Compartilhar → Salvar em Arquivos.

## DUUK Admin 2.0 e Social Media — 2.0.0

- Visual, navegação e temas: `docs/admin-2.0-design-system.md` e `docs/admin-2.0-plan.md`. O tema (claro, escuro ou sistema) é salvo por conta e aparelho; o atributo `data-duuk-admin-theme` só existe enquanto o Admin está aberto, então o site público não muda.
- Social Media: `docs/social-media-setup.md` (Meta, permissões, Cron, limites, validação e reversão). A permissão `social` precisa ser concedida a quem não for superadministrador.
- Reversão do frontend: promover na Vercel a implantação 1.12.0 (commit `ba229ab`). O banco só ganhou tabelas e funções novas, então a 1.12.0 continua funcionando com ele.

## Aparência e saudação — 1.9.1

O botão de tema está visível no topo do celular e do desktop, no menu do celular e na entrada de login. O texto indica o modo que será ativado. O acesso mobile anterior era ocultado pelo contêiner do menu; a versão 1.9.1 corrige essa precedência sem alterar a preferência por conta/aparelho. As frases da saudação alternam automaticamente, sem botão de play/pausa; continuam respeitando movimento reduzido e aba oculta. A atualização usa o fluxo explícito da PWA, preservando formulários pendentes.

## Conforto e confirmação por e-mail — 1.9.0

O painel oferece modo claro, saudação animada, renomeação explícita de pastas e ajustes de responsividade. Novos links de assinatura exigem código de seis dígitos pelo Titan, vinculado ao e-mail definido pelo administrador; convites anteriores continuam válidos até expirar. A confirmação registra acesso à caixa, sem identificação civil. Instalação, limites e testes estão em [admin-1.9-validation.md](admin-1.9-validation.md).

## DUUK AI — 1.8.0

O módulo `/admin/ai` acrescenta criação de roteiros, conceitos, apoio comercial e ajuda contextual. Conversas ficam privadas; documentos têm versões, PDF com a marca original e compartilhamento explícito por projeto. A Edge Function `duuk-ai` usa o SDK oficial Gemini, Supabase Auth, permissões ativas, Vault e limites por membro, sem modelos pagos ou repetição automática após erro. O assistente não recebe automaticamente registros de clientes. A versão 1.8.0 acrescenta ações confirmadas em cartões: compromissos, despesas e follow-ups, além de consulta da agenda. A confirmação usa os fluxos existentes, com permissões atuais e proteção contra duplicação. Consulta e opções locais permanecem na DUUK, sem transferência ao modelo. A conta central `duukfilms@gmail.com` foi conectada em 9 de outubro de 2026, em projeto no Nível gratuito, e os quatro modos passaram em chamadas reais com dados fictícios, streaming e persistência. A versão 1.7.2 melhora instruções, reconhece pedidos criativos no modo Livre e mantém a intenção nas revisões. A ajuda usa somente os detalhes relevantes do manual autorizado. O aceite de privacidade é salvo por pessoa e versão no servidor, restaurado em outros aparelhos e revogável; o foco visual ficou neutro, sem contornos vermelhos internos. Configuração e validação estão em [duuk-ai-setup.md](duuk-ai-setup.md) e [duuk-ai-validation.md](duuk-ai-validation.md). A versão usa o mecanismo existente de atualização do aplicativo.

## Google Drive — 1.6.0

Contratos originais, contratos assinados e propostas comerciais são guardados no Google Drive da conta central da DUUK, por uma fila no banco processada a cada minuto pela Edge Function `duuk-drive`. Configuração, estrutura de pastas, regras de repetição e roteiro de validação com conta real estão em [google-drive-setup.md](google-drive-setup.md). A migração, o deploy da função, a Google Drive API, o escopo `drive.file`, o cliente Web DUUK Drive e os segredos `DUUK_DRIVE_GOOGLE_*` foram configurados. A conta central `duukfilms@gmail.com` está conectada; o original pendente foi enviado ao Drive com confirmação real HTTP 200, sem falhas. A biblioteca `/admin/drive` oferece busca, categorias, upload privado até 20 MB, visualização e download; sua permissão não concede acesso a Contratos ou CRM. As correções de fila mantêm o `safeupdate` das sessões da API. Instale também as migrações incrementais de fila, biblioteca e atualizações com filtro.

A versão 1.6.0 acrescenta navegação por pastas, criação, nomes/descrições, movimentação e lixeira com restauração. A migração `google-drive-folders.sql` e a função atualizada compartilham o lease com o worker, registram operações idempotentes e preservam as permissões ao mover. A exclusão afeta somente a cópia do Google; fontes dos contratos e evidências continuam privadas no painel. Pastas na lixeira bloqueiam novos envios até serem restauradas. O menu usa a logo oficial do Drive no último item. Nenhum novo escopo ou segredo Google é necessário.

## Agenda Google, navegação e notificações — 1.3.0

Configuração externa e roteiro de validação estão em [google-calendar-setup.md](google-calendar-setup.md). Em 7 de outubro de 2026, o projeto Google Cloud `duuk-511001` recebeu o cliente Web DUUK Agenda, com OAuth externo em produção e os três escopos não confidenciais mínimos. As duas credenciais foram salvas nos Secrets das Edge Functions. A conta `filmzerick@gmail.com` concluiu OAuth real, com retorno correto e código removido da URL; um compromisso existente foi exportado sem erro e a fila ficou zerada. Múltiplas contas, edição, exclusão e desconexão externas ainda não foram validadas em contas reais. A marca Google continua sem verificação e o consentimento pode apresentar o domínio duukfilms.com. A integração usa state/PKCE vinculado à sessão DUUK, tokens criptografados no Vault e exportação exclusivamente DUUK → Google. O painel informa **Aguardando configuração** se as credenciais forem removidas. O worker `duuk-calendar` valida usuários por Supabase Auth e o dispatch por segredo Cron; não habilite a verificação legada JWT do gateway sem adaptar a autenticação.

`calendar-integration.sql` contém as tabelas privadas, RPC exclusiva do servidor e fila de sincronização. Cron roda a cada minuto. As tabelas de conexões/fila e os estados OAuth têm RLS, sem grants ou policies de acesso pelo navegador: os apontamentos informativos [RLS Enabled No Policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) são intencionais nessas tabelas. Não crie policies abertas para eliminar esse aviso. Novas chaves estrangeiras têm índices; os avisos anteriores de performance e proteção de senhas permanecem sem mudança de plano.

`notification-actions.sql` gera notificações na mesma transação das ações reais: criação/edição/cancelamento/exclusão de compromisso, atribuição de responsável, novo cliente, contato, mudança de etapa, oportunidade criada em proposta/negociação e criação/visibilidade de projeto. Alertas gerais não avisam novamente quem acabou de executar a própria ação; a atribuição de responsabilidade tem aviso próprio. Preferências e permissões são verificadas na geração, leitura e envio push. O portfólio ainda não tem campos de responsável, prazo ou conclusão de produção, portanto esses alertas não são fabricados. Lembretes de agenda continuam ativos; follow-ups também recebem aviso uma hora antes. Super administradores podem enviar avisos em **Notificações → Novo aviso**, no máximo cinco por hora. Atualizações do aplicativo continuam no aviso explícito da PWA; o histórico de versões e a janela de novidades continuam removidos.

A publicação Realtime inclui notificações com RLS por destinatário e módulo. A interface assina INSERT/UPDATE, mantém fallback por foco/conexão e consulta a cada trinta segundos. O contador usa a contagem completa permitida pelo banco, mesmo que a lista mostre as cem notificações mais recentes. Leitura individual, leitura de todas e links para o compromisso, cliente ou projeto estão disponíveis.

A investigação não encontrou o literal “from” nos títulos/corpos armazenados nem nos componentes e geradores de notificações da DUUK. O usuário confirmou que aparece no aviso do próprio iPhone. O service worker passou a declarar `lang: pt-BR`, além do idioma já definido no manifest e na página. Essa declaração identifica o idioma do conteúdo; não garante tradução da linha de origem desenhada pelo iOS/navegador. A API Web Push não oferece um campo para remover ou substituir essa linha do sistema, portanto não afirme que ela foi corrigida no aparelho. Referências: [Web Push no iOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) e [opções da API Notifications](https://notifications.spec.whatwg.org/#dictdef-notificationoptions). Não apague palavras de assuntos ou mensagens fornecidos por terceiros para mascarar a origem.

Validação 1.3.0: testes de protocolo Google isolados, testes SQL com rollback (OAuth entre contas, replay, backfill, duas contas, Vault, fila/revisões/leases, falhas, desconexão, exclusão, triggers e RLS), type check das Edge Functions e verificações de endpoints anônimos. A UI usa sessão e APIs fictícias isoladas para testar integração indisponível, callback/remoção do código da URL, desconexão, responsável na agenda, sino, leitura e aviso administrativo. Menu e integração foram conferidos em 320, 390, 480, 768, 1024 e 1440 px, incluindo persistência após recarregar e drawer mobile. Nenhum push ou e-mail de teste foi enviado a aparelhos reais. Após a configuração Google, OAuth e a exportação de um compromisso existente também passaram em uma conta real; o restante da validação externa continua pendente conforme descrito acima.

## Acesso e autorização

O painel está em `https://www.duukfilms.com/admin`. O site institucional não contém links para ele. As contas individuais solicitadas foram criadas no Supabase Auth, sem senhas no repositório. As contas e permissões são administradas pelo usuário em Configurações; não reative uma conta desativada para executar testes.

Em Configurações, o administrador pode gerenciar usuários, grupos e exceções individuais. Uma exceção de bloqueio prevalece sobre o grupo; super administradores mantêm acesso completo. O banco impede desativar ou rebaixar o último super administrador. Desativar uma conta bloqueia as operações no servidor imediatamente; a interface revalida o contexto ao focar e a cada minuto.

RLS protege os registros privados e as Edge Functions validam o usuário ativo e a permissão. As tabelas de configuração, subscriptions, fila e cursor são acessíveis exclusivamente pelo backend. O advisor informa ausência de policies nessas tabelas porque esse bloqueio é intencional. O aviso existente sobre proteção contra senhas vazadas depende do plano do Supabase; o projeto continua gratuito.

## Conteúdo e módulos

Salvar portfólio ou abertura publica o conteúdo numa única transação, com controle de revisão. Rascunhos e arquivados ficam privados. Uploads diretos continuam limitados a 50 MB por arquivo e ao espaço disponível do plano gratuito; vídeos maiores podem usar YouTube.

CRM usa clientes, atividades, follow-ups, histórico e etapas reais. Mudanças de pipeline e conclusões de follow-up verificam a revisão atual. O pipeline move o cartão imediatamente, sinaliza o salvamento e confirma com o registro retornado pelo servidor; falhas devolvem o cartão e recarregam os dados. A alça permite arraste por mouse ou toque, com rolagem horizontal nas bordas. Escape cancela o arraste; o seletor de etapa oferece uma alternativa por teclado. O sistema não contém leads de demonstração permanentes.

Login mobile exibe a foto de bastidores com a logo original. A abertura e a atualização do aplicativo usam o mesmo carregamento, com saída gradual e respeito à preferência por movimento reduzido. Atualizações de dados mantêm listas e valores visíveis; os placeholders aparecem apenas na primeira consulta ou ao mudar de mês.

Contratos preservam PDFs privados, campos, links separados com validade de sete dias, aceite e desenho. Lixeira revoga links e permite restaurar. Exclusão definitiva exige ausência de assinaturas. Não há certificado ICP-Brasil nem verificação de identidade por e-mail.

Despesas exportam Excel/CSV conforme mês e filtro. A agenda usa horários de Brasília e cada compromisso registra uma pessoa responsável escolhida entre os perfis ativos da equipe; eventos antigos foram atribuídos a quem os criou. Insights excluem administrativo e assinaturas; retenção de 90 dias e limpeza diária de chaves temporárias derivadas do IP permanecem ativas.

## Conectar a caixa Titan da GoDaddy

Um super administrador abre Comercial > E-mails > Conectar Titan e informa a senha da caixa `contato@duukfilms.com`. A senha do administrativo não é utilizada como senha de e-mail. O formulário não persiste a credencial no navegador e a conexão não envia mensagens de teste.

A Edge Function verifica a conta ativa, a permissão de e-mail e o acesso de super administrador, limita a cinco tentativas por 15 minutos, valida o acesso à caixa de entrada e a autenticação SMTP, e só então grava a senha criptografada no Supabase Vault. Somente `service_role` pode executar as RPCs de leitura e gravação. A reconexão substitui a credencial de forma atômica e gera auditoria sem segredo. Em uma falha de validação, a configuração anterior é preservada. “Gerenciar conexão” permite trocar a senha depois.

Hosts fixos: `imap.secureserver.net:993` e `smtpout.secureserver.net:465`, ambos TLS, conforme as [instruções oficiais da GoDaddy para Titan](https://www.godaddy.com/en-in/help/manually-add-my-professional-email-powered-by-titan-to-outlook-windows-28011). O Titan vendido pela GoDaddy usa esses hosts. A conta foi contratada pela GoDaddy; sua interface pode não ter os menus de outros revendedores Titan. Use a senha que abre o endereço de e-mail no webmail e siga a [orientação da GoDaddy](https://www.godaddy.com/pt-br/help/usar-as-configuracoes-imap-para-adicionar-meu-professional-email-a-um-cliente-de-email-32204). A senha da conta GoDaddy pode ser diferente da senha da caixa. Se houver verificação em duas etapas, consulte as opções de acesso disponibilizadas pela GoDaddy para essa conta.

Para instalações anteriores, `DUUK_MAIL_USERNAME` e `DUUK_MAIL_PASSWORD` nos segredos das Edge Functions continuam como fallback quando não há credencial no Vault. A configuração pelo painel tem prioridade. Nenhum plano pago é necessário para esta integração.

Depois de conectar, valide a caixa de entrada e um envio individual para um destinatário autorizado. O job existente consulta mensagens novas a cada cinco minutos; a primeira consulta cria uma linha de base para não notificar todo o histórico antigo. A busca retorna até 50 mensagens recentes. Anexos do composer somam até 5 MB, no máximo cinco arquivos. Envios têm limite de dez por usuário/hora e identificador idempotente. Se o provedor não confirmar o envio, o painel pede conferir Enviados antes de tentar uma nova mensagem.

Credenciais, corpos de mensagens e conteúdo dos anexos não entram na auditoria. O banco guarda referências de mensagens e vínculos comerciais; leitura e envio usam o provedor real. O usuário confirmou a conexão funcionando em 7 de outubro de 2026; a presença da configuração no Vault foi verificada sem ler sua senha.

## Notificações e aplicativo

Configurações > Notificações permite ativar Web Push explicitamente no dispositivo e escolher categorias. Subscriptions pertencem ao usuário e podem incluir até dez dispositivos. Desativar ou sair remove somente o dispositivo atual. A entrega depende da permissão do navegador/sistema operacional e da conectividade do aparelho.

No iPhone/iPad compatível, instale pelo Safari > Compartilhar > Adicionar à Tela de Início, abra pelo ícone instalado e ative as notificações. A interface orienta dispositivos sem suporte. O recebimento em aparelho físico precisa ser validado no dispositivo do usuário.

VAPID privado e token do agendamento ficam criptografados no Supabase Vault. O cliente recebe somente a chave pública. O Cron dispara a função a cada cinco minutos. Preferências, permissões, deduplicação, tentativas limitadas e remoção de endpoints expirados são verificadas no backend.

O topo do painel mostra os membros conectados pelo tópico privado de Realtime Presence `duuk:team:presence`; a lista de usuários mostra online ou offline. A contagem reúne várias abas e aparelhos da mesma pessoa. A presença permanece enquanto ao menos uma conexão do painel ou do site autenticado está ativa, inclusive em segundo plano quando o navegador a mantém. Ao fechar tudo ou quando iOS/Android suspendem a PWA, a pessoa fica offline após o Supabase detectar a queda. Esse estado é informativo e não participa da autorização.

Eventos reais incluem compromissos de amanhã/uma hora, follow-ups, assinatura recebida, resumo financeiro do mês encerrado e e-mails novos após conectar o Titan. Notificações internas ficam por 180 dias. O histórico de versões e os avisos de novidades foram removidos da interface a pedido do usuário; não publique novos eventos de versão.

## Publicar atualizações

1. Atualize `src/admin/releases.json`: primeira entrada é a versão atual, com data real, título e mudanças. Esse é o único local com a versão da aplicação.
2. Execute `npm test`, `npm run lint` e `npm run build` usando Node 22. O build gera identificador por conteúdo, shell, worker e metadados de versão.
3. Envie o commit para `origin/main`, aguarde Vercel e verifique `/admin`, `/admin-version.json`, manifest e site público.
4. Confira o controle de atualização do aplicativo, sem publicar notificações de versão ou reintroduzir histórico/janelas de novidades. Os metadados públicos incluem somente a versão atual.

O worker controla somente a área administrativa. Cache Storage contém shell genérico, JS/CSS/fontes e ícones; não armazena respostas de API, dados de CRM, PDFs ou assinaturas. Uma nova versão aguarda “Atualizar app”; formulários pendentes impedem a atualização. Somente a aba que solicitou a instalação recarrega. Caches necessários a outras abas abertas são preservados.

O aviso e a consulta de novidades vistas foram retirados da interface. As policies da tabela legada continuam impedindo acesso ou transferência para outro usuário; o teste SQL de preferências e permissões permanece em `supabase/tests/notification-settings.sql`.

Sem internet, o aplicativo abre o shell e informa a desconexão. Não grava alterações offline. No primeiro carregamento sem conexão, solicita reconexão para validar o acesso, sem persistir perfis ou dados privados em cache.

## Validação

Testes automatizados cobrem conteúdo, mídia, calendário, despesas/Excel e métricas comerciais. A integração real verifica autenticação, RLS, revisões antigas e funções exclusivas do servidor. A validação com registros temporários cobriu CRM, histórico, pipeline, follow-ups, exceções individuais, avatar privado e contas desativadas; os registros de teste foram removidos.

Navegador: 23 rotas, larguras 320/375/390/430/768/1024/1440, drawer, formulários, permissões e cache. A atualização da PWA é exercitada localmente entre dois builds, incluindo formulário pendente, outra aba aberta e recuperação offline. Nenhum documento real é assinado ou alterado nesses testes.

Validação visual: capa e formulário de login em telas pequenas e baixas, carregamento único durante a troca do chunk inicial, atualização sem ocultar listas e recuperação de falhas. O pipeline foi exercitado com respostas interceptadas no navegador, incluindo arraste por mouse e eventos reais de toque, rolagem nas bordas, cancelamento, revisão retornada pelo servidor, falha com retorno do cartão e confirmação rápida sem interromper a animação. Esses testes visuais não gravam clientes de demonstração no banco.

Limitações externas: entrega Web Push em aparelho físico exige ativação e teste no aparelho. Nenhum plano pago, provedor bancário ou integração de cobrança foi contratado.

Validação 1.1.0: `supabase/tests/mail-connection.sql` verifica privilégios, bloqueio de usuários sem super administração, criptografia, substituição atômica e auditoria sem segredo, com rollback de todos os dados de teste. A API real verifica status, acesso por módulo, bloqueio anônimo, senha vazia/excessiva e impossibilidade de chamar as RPCs de credenciais pelo navegador. Nenhuma tentativa de autenticação Titan é feita com senha fictícia. A validação de entrada e envio reais aguarda a credencial inserida pelo usuário.

Nesta publicação, os 16 testes unitários passaram; o teste opt-in do Supabase permaneceu desativado e foi complementado pelas consultas SQL e chamadas autenticadas reais descritas acima. Lint passou com os três avisos preexistentes e o build de produção passou. A varredura abriu dez formulários de criação, calendários aninhados, biblioteca de capas e horários em dez larguras (320–1440 px), sem rolagem lateral interna. Também verificou 23 rotas administrativas em sete larguras, cinco páginas públicas em dez larguras, PDF privado em modo de leitura e exportação Excel. O novo formulário Titan passou em 11 dimensões, incluindo telas baixas e na horizontal, com erro, validação em andamento e sucesso simulados sem gravar senha real. A atualização 1.0.2 → 1.1.0 preservou formulários pendentes, outras abas e a recuperação offline, sem cache de dados privados.

## Correção da conexão GoDaddy — 1.1.1

O teste no Edge Runtime de produção reproduziu a queda de IMAP após o primeiro comando ID, antes de enviar qualquer senha. O mesmo comando por TLS nativo do Deno recebeu a resposta correta. SMTP respondeu ao teste sem autenticação. A conexão usa agora `NativeImapSocket`, mantendo o parser e os comandos do ImapFlow 2.2.6, com I/O TLS nativo e validação normal do certificado. Não há proxy, host fornecido pelo usuário ou opção de desabilitar certificados.

O adaptador substitui a fábrica de sockets somente durante a chamada síncrona inicial de `connect()` e a restaura em `finally`, antes de qualquer espera. Essa propriedade depende do ImapFlow fixado em 2.2.6; teste novamente a negociação, o isolamento entre chamadas e a restauração da fábrica antes de atualizar a biblioteca. Autenticação recusada retorna 422; falha de transporte retorna 502. Logs contêm apenas etapa, categoria e códigos de uma lista fixa, sem mensagens brutas do provedor, corpo ou credenciais.

Validação: 22 testes Node passaram (um opt-in foi ignorado), incluindo escrita parcial, preservação de bytes, timeout, destruição do socket, erros de TLS, isolamento/restauração da fábrica e ausência de segredos nos erros. Dois testes em `supabase/tests/imap-transport.integration.ts` autenticaram uma conta fictícia, abriram INBOX, pesquisaram UIDs, leram um literal e verificaram rejeição de senha sobre um servidor TLS local com CA de teste. Execute-os com Deno, `--allow-net --allow-read --allow-env --allow-sys=hostname` e as variáveis `DUUK_TEST_TLS_CERT`, `DUUK_TEST_TLS_KEY`, `DUUK_TEST_TLS_CA` apontando para certificados temporários de localhost; nunca use credenciais ou chaves reais nesse fixture. O novo texto do formulário passou em 11 dimensões e as restrições da API real continuaram passando. A negociação real com a GoDaddy foi verificada sem senha; recebimento e envio reais dependem de concluir a conexão pelo painel.

## E-mail e interface — 1.2.0

A caixa mostra Entrada, Não lidas, Enviados e modelos. A leitura permite resposta, resposta a todos, encaminhamento, download de anexos e marcação como não lida. O composer usa Tiptap local, carregado ao abrir: negrito, itálico, sublinhado, destaque, listas, links, desfazer/refazer e limpeza de formatação. Cc/Cco e múltiplos destinatários aceitam até 20 endereços por mensagem. Anexos continuam limitados a cinco arquivos e 5 MB no total, com adição cumulativa, remoção e arraste; o encaminhamento oferece inclusão explícita dos anexos originais.

O backend valida destinatários, tamanho, base64 e cabeçalhos, sanitiza HTML e mantém o limite anterior de dez envios por usuário/hora. MailComposer gera uma mensagem com ID estável: o envelope SMTP inclui Cco, mas os bytes entregues não incluem o cabeçalho Bcc. A cópia privada em Enviados preserva Cco. A confirmação SMTP é registrada antes de salvar a cópia; uma falha no arquivo não pede reenvio. A pasta usa o atributo especial do provedor, com fallback fixo, e verifica o Message-ID para evitar duplicar uma cópia já criada pelo servidor.

HTML recebido passa por uma lista de elementos/atributos permitidos e é exibido em iframe isolado, sem scripts, formulários, acesso à origem do painel ou recursos remotos. Mensagens de texto simples continuam legíveis. Conteúdo e anexos ficam na memória da composição, sem persistência em localStorage ou Cache Storage.

O histórico de versões e as janelas de novidades foram retirados; o botão de atualização da PWA e a proteção de formulários pendentes permanecem. Os botões de atualizar não reservam uma linha vazia para feedback. O menu posiciona a logo original no topo e o botão de minimizar ao lado, com ícone próprio para expandir. O convite público de contato é “O QUE VEM A SEGUIR?” / “WHAT COMES NEXT?”.

Validação: 22 testes Node passaram (um opt-in ignorado), lint com os três avisos preexistentes e build de produção. Os sete testes Deno em `supabase/tests/mail-content.test.ts` cobrem sanitização, cabeçalhos, destinatários, anexos, geração e leitura MIME, proteção de Cco e arquivo em Enviados. Execute com `deno test --allow-env --allow-sys=hostname supabase/tests/mail-content.test.ts`. A UI foi testada com dados de demonstração em 11 dimensões (320–1440 px, incluindo paisagem), envio simulado, erro/repetição com o mesmo identificador, resposta/encaminhamento e anexos. Menu, marca e ausência de histórico foram conferidos em cinco larguras; o convite público em quatro. Leitura em iframe e composição passaram também com os mesmos cabeçalhos de segurança da produção. A conta antiga utilizada pelos testes foi desativada durante o trabalho e continuou recebendo 403 na API; a consulta anônima continuou recebendo 401. Nenhuma permissão foi alterada para testar. A configuração da caixa e um super administrador ativo foram confirmados por consultas sem revelar segredos. Nenhum e-mail real foi enviado durante a validação.

## Notificações por dispositivo — 1.2.1

O diagnóstico de 7 de outubro encontrou apenas um computador macOS registrado, sem endpoint Apple/iPhone. Cron estava ativo a cada cinco minutos, com HTTP 200; o lembrete das 19h55 UTC teve um envio aceito pelo provedor para o computador, sem falhas. Não foram lidas chaves de subscriptions, segredos VAPID ou token do Cron.

A tela agora cruza a permissão do navegador, a subscription local e o cadastro do mesmo endpoint para a conta ativa no servidor. Um cadastro local sem registro remoto aparece como desconectado, com reconexão explícita. Falhas de inspeção são visíveis. A ativação no iPhone pede permissão diretamente no toque, antes da chamada de rede; permite reutilizar a subscription existente e renovar uma chave antiga. O servidor aceita recadastrar um endpoint já pertencente à conta mesmo no limite de dez dispositivos.

“Testar notificação” envia somente ao endpoint selecionado e pertencente ao usuário autenticado. Limite: três testes a cada cinco minutos. HTTP 404/410 do provedor remove apenas o cadastro expirado; falhas de transporte preservam o cadastro. Logs registram somente etapa e código numérico, sem endpoint, conteúdo ou chaves. Aceitação pelo provedor não comprova exibição no aparelho: é necessário conferir a Central de Notificações. Instalar a PWA não concede permissão automaticamente. No iPhone, abrir pelo ícone instalado, ativar nesta tela e permitir no sistema; bloqueios podem exigir Ajustes > Notificações > DUUK Admin, revisão de Foco e Resumo Agendado.

Lembretes da agenda continuam um dia antes às 9h e uma hora antes (exceto avisos de uma hora para eventos de dia inteiro), com verificação a cada cinco minutos. Não há reenvio do histórico antigo ao conectar um novo aparelho. Notificações internas continuam disponíveis conforme permissões. Nenhum novo evento de versão foi publicado.

Validação: 22 testes Node, um opt-in ignorado; quatro testes Deno em `supabase/tests/push.test.ts` verificam endpoints Apple válidos, proteção contra redirecionamento, chaves inválidas, isolamento entre contas/dispositivos, limite de testes, expiração e preservação do cadastro em falhas. Type check do backend passou. Navegador com dados e Push API simulados, service worker real e cabeçalhos de produção: reconexão, erro ao cadastrar, cadastro não confirmado, primeira permissão somente por toque, erro de inspeção, teste aceito, teste expirado/limitado, desativação, bloqueio do sistema e orientação de instalação. Layout em oito dimensões (320–1440 px, incluindo paisagem). O endpoint real continua recusando status e teste anônimos com 401. Nenhum push de teste foi disparado pela validação para aparelhos reais; recebimento no iPhone depende da ativação e do teste feito pelo usuário.

## WhatsApp comercial — 1.4.0

Comercial oferece conversas por links oficiais `wa.me` nos clientes e follow-ups, sem API, mensalidade ou sessão do WhatsApp armazenada. O aparelho escolhe como abrir o link conforme os aplicativos instalados. O envio é manual dentro do WhatsApp; abrir a conversa não grava contato, envio nem leitura. A mensagem permanece somente na memória da composição e na URL que o próprio usuário abre.

Comercial > Modelos de mensagens contém oito textos iniciais editáveis e permite criar ou desativar modelos. A edição exige `crm.activities`; a leitura exige acesso comercial. As variáveis `{nome_cliente}`, `{nome_empresa}`, `{nome_projeto}` e `{data_evento}` usam os dados do cliente. Projeto e data do evento são campos explícitos do cadastro, sem inferência de compromissos da agenda. Dados ausentes podem ser preenchidos apenas para a mensagem atual, sem alterar o cadastro. Telefones passam por validação internacional; use +DDI, DDD e número, sem ramais ou links.

“Registrar contato realizado” usa uma transação para salvar o histórico e, opcionalmente, mudar a negociação e criar o próximo follow-up. A operação exige a revisão atual e um identificador estável, impedindo duplicação ao repetir uma resposta perdida. Alterar a etapa exige `crm.pipeline` ou `crm.clients`; agendar exige `crm.followups`. O responsável do próximo contato é o responsável comercial se tiver permissão, ou quem registra. Reagendar altera o vencimento com revisão; concluir preserva o histórico. O painel calcula clientes, negociações abertas, contatos, follow-ups, propostas e ganhos a partir dos registros reais. O filtro de período afeta os contatos registrados; os demais indicadores mostram o estado atual do responsável selecionado.

O agendador existente gera às 9h de Brasília o resumo de clientes para contatar no dia, follow-ups de amanhã, propostas aguardando retorno por três dias e negociações sem atualização por sete dias. Responsável, permissões, preferências e deduplicação são verificados antes do envio. Os alertas de proposta e inatividade se renovam somente após novo contato ou mudança de etapa. A etapa recebe uma data de referência na instalação; clientes anteriores começam a contar esse prazo a partir da instalação, preservando revisões e histórico existentes. Lembretes de uma hora, agenda, financeiro e retenção permanecem no agendador anterior.

Validação: testes unitários de números, links, codificação, variáveis e métricas; fixture SQL `supabase/tests/whatsapp-crm.sql` com rollback para RLS, atomicidade, idempotência, concorrência, permissões, reagendamento, conclusão e deduplicação dos alertas. Navegador com respostas interceptadas em 320–1440 px verificou composição, campos ausentes, modelos, registro, follow-ups e filtros. Abrir o link não realizou gravações. Nenhuma mensagem WhatsApp ou push real foi enviada nos testes.

## Aparência e novidades — 1.9.2

Modo claro agora inclui menu claro e superfícies mais leves, com contraste revisado e a marca branca original sobre a paleta coral/laranja, sem a caixa preta do topo. A animação de carregamento fornecida foi convertida para MP4 H.264 de 115 KB, sem áudio ou metadados pessoais, com autoplay/playsinline e poster para movimento reduzido. O site institucional conserva seu carregamento anterior.

Novidades surgem para versões disponíveis e recém-instaladas, por conta, versão e aparelho. X, Escape e Continuar fecham imediatamente; o aceite fica local e tem fallback em memória, sem RPC ou bloqueio por conexão/permissão. A abertura automática aguarda formulários pendentes, outra janela e carregamento. Sobre mostra as notas atuais; o aviso de atualização permite reabrir as disponíveis. A instalação continua explícita e conserva o bloqueio de formulários não salvos e os caches privados existentes.

A ajuda DUUK AI pode ser movida por toque, mouse ou setas. Posições são locais e separadas por conta; viewport, teclado e rodapé limitam o movimento. A janela do computador tem alça de arraste; no celular permanece em tela cheia. Arrastar não dispara abertura, e rascunhos continuam exigindo confirmação antes de fechar.

## Carregamento e marca — 1.9.3

Após ver a 1.9.2 publicada, o usuário pediu retirar o vídeo de carregamento. A marca e a animação discreta anteriores foram restauradas; não há vídeo, áudio, botão de play ou poster adicional. O loader e o fallback do site público voltaram aos arquivos anteriores. Os assets de filme também foram removidos.

O usuário autorizou explicitamente exibir o PNG branco em preto no modo claro. O arquivo original permanece intacto, com forma e transparência preservadas; brightness(0) afeta somente a marca do menu/cabeçalho do Admin. Não há badge, padding ou caixa de fundo, e o menu/cabeçalho ficam claros. No escuro e no site público a marca continua branca. Novidades, correções do banner/Sobre, refinamentos de contraste e movimento da ajuda DUUK AI permanecem. A publicação segue o mesmo fluxo de atualização explícita da PWA; confira a versão/build no domínio e no worker depois do push.

## Financeiro e interface — 1.10.0

Financeiro (`/admin/financeiro`) contém Resumo, Lançamentos, Fluxo de caixa e Metas. As despesas continuam em `duuk_expenses`, sem cópia nem alteração dos registros anteriores. A rota legada `/admin/despesas` continua disponível. Receitas são registradas em `duuk_income`; metas e orçamento usam `duuk_finance_goals`, uma linha por mês. Todas as operações exigem a permissão atual `finance` no banco, inclusive membros ativos e exceções individuais. A migração aplicada é `supabase/migrations/20261013213527_duuk_finance_income_goals.sql`; não reaplique manualmente sobre as tabelas existentes.

O controle é manual. Cadastre receita, valor, vencimento e categoria; cliente/origem é opcional. Recebido exige a data efetiva, sem data futura. Edite uma receita ou despesa para registrar o recebimento/pagamento. Reabrir uma receita remove sua data de recebimento. Os valores previstos e contas abertas usam o vencimento no mês escolhido; recebimentos, pagamentos, metas e fluxo usam a data efetiva, inclusive para contas com vencimento em outro mês. O gráfico mostra o resultado acumulado do mês, sem saldo inicial nem conexão bancária.

Metas são exclusivas de cada mês. Meta de recebimentos e orçamento de despesas aceitam zero/vazio como não definidos; remover metas não altera lançamentos ou outros períodos. O orçamento informa a comparação com despesas pagas e não impede lançamentos. Edições e exclusões conferem a revisão do registro; em conflito, o membro recebe o erro e mantém o rascunho. Novos lançamentos usam o mês selecionado como vencimento inicial. Não são criados dados de demonstração na produção.

Lançamentos oferece busca, tipo, situação, categoria e escolha entre vencimento e pagamento/recebimento. CSV e Excel respeitam os filtros. Excel inclui quatro abas: lista filtrada, resumo completo do mês, fluxo diário e metas do período. Exportações ficam desativadas durante carregamento e erro, evitando usar dados antigos. As receitas e metas geram auditoria privada com a permissão financeira; a auditoria anterior dos demais módulos é preservada.

O resumo integrado e os círculos de progresso usam registros reais. Sem dados ou meta, não há percentual inventado. Menu, formulários, agenda, e-mail, Drive e IA compartilham superfícies e foco neutro, com versões clara/escura e movimento reduzido. Logo, loader automático sem vídeo, notas por conta/versão e atualização explícita com proteção de formulários continuam no mecanismo anterior. As alterações de estilo são restritas ao Admin.

O manual estático da DUUK AI explica as quatro abas, datas e exportações. A IA não consulta dados financeiros privados nem ganhou ferramentas de recebimento, metas ou pagamento. O prompt mestre, cotas gratuitas, consentimento e ações anteriores permanecem. Consulte `docs/admin-1.10-validation.md` para evidências e limites da validação.

## Extratos OFX e chave de tema — 1.10.1

O usuário escolheu a conta Nubank PJ e importação gratuita por OFX, em vez de contratar conexão automática. Financeiro > Extratos > Importar OFX oferece prévia, nome da conta, entradas/saídas e confirmação explícita. Limites por arquivo: 2 MB e 2.000 movimentações em BRL. Aceita OFX SGML/XML da conta, sem faturas de cartão, declarações externas, arredondamento de valores ou registros sem FITID. Os campos do arquivo são tratados como texto. Não são usadas senha, sessão, API privada ou credenciais do banco, e o OFX original não fica armazenado. O arquivo deve ser exportado no Nubank e escolhido pelo membro. Orientação oficial: https://nubank.com.br/empresas/imposto-de-renda.

`duuk_bank_imports` guarda metadados mínimos e o saldo/data informados no arquivo; `duuk_bank_transactions` guarda movimentações privadas. A identificação completa da conta e os FITIDs são substituídos por hashes no servidor; somente os últimos quatro caracteres da conta ficam legíveis. O saldo não é apresentado como consulta atual ao banco. Mês e filtros permitem ver os movimentos, sua origem e o estado de revisão.

Importar não cria receitas/despesas. Em Revisar, Vincular existente baixa uma conta pendente do mesmo valor na data efetiva do extrato, mantendo o vencimento. Uma conta já concluída deve ter a mesma data e valor. Criar receita/despesa requer confirmação e usa o valor/data do banco. Ignore transferências internas, pagamentos de fatura ou valores já contabilizados para não duplicar o resultado. Reabrir revisão não cria registros. Remover vínculo conserva o lançamento financeiro. Se um lançamento vinculado for alterado depois, a interface mostra Revisar vínculo; a evidência importada permanece intacta. Excluir um lançamento pelo cadastro legado limpa apenas sua referência no extrato.

As RPCs `duuk_import_bank_statement` e `duuk_reconcile_bank_transaction` validam permissão financeira atual, fazem a transação completa e conferem revisão/idempotência. Um FITID é único por conta; importar períodos sobrepostos não duplica movimentos. Uma identificação existente com outro valor/data rejeita o arquivo inteiro, sem importação parcial. Um lançamento não pode ficar vinculado a dois movimentos. Membros sem financeiro, desativados e anônimos não leem nem gravam esses dados. Tabelas não permitem gravação direta pelo navegador; não amplie grants ou substitua estas RPCs por sequências de inserts/updates no cliente.

Migração aplicada: `supabase/migrations/20261014050206_duuk_bank_ofx_import.sql`. Fixture com rollback: `supabase/tests/bank-ofx.sql`. Não crie importações reais de teste nem envie extratos/registros automaticamente ao Gemini. A ajuda estática da IA orienta os passos, sem ferramentas bancárias. A nova chave de tema usa ícone, `role=switch`/`aria-checked`, teclado e preferência por conta/aparelho; mantém o modo claro e o escuro existentes.

## Conta conectada e Extratos — 1.11.0

Financeiro > Extratos permite alternar **Conta conectada** e **Arquivos OFX**. A conexão central Meu Pluggy consulta uma única conta BANK em BRL, escolhida pela super administração. Saldo, data de atualização, movimentações por mês, busca/tipo e CSV usam a API oficial. Somente movimentos POSTED entram nos totais; PENDING fica identificado. As duas origens não são somadas e a consulta não cadastra receitas/despesas. Arquivos OFX continuam permitindo revisão/vínculo explícitos.

A integração aceita exclusivamente o conector real **MeuPluggy (200)**, sem Sandbox, conexões comerciais diretas, planos pagos, pagamentos ou consulta instantânea de saldo. O guia oficial https://meu.pluggy.ai/api-guide informa que esse caminho gratuito de dados próprios não expira com o trial; a origem atualiza a cada 24 horas. Atualizar no painel consulta o que já está disponível. Não chame PATCH para atualizar uma conexão proxy concluída nem GET /accounts/{id}/balance: o saldo instantâneo é restrito a conectores Open Finance, e o proxy 200 não é um deles. Contas de clientes/terceiros exigem outro modelo comercial e não estão implementadas.

Em Configurações > Integrações > Meu Pluggy, um super administrador com Financeiro pode conectar/trocar/desconectar. No portal Meu Pluggy conecte o banco real; no Dashboard use o mesmo login e o conector MeuPluggy na aplicação Demo, em vez de conectar o banco diretamente ou Sandbox. Guarde Client ID/Client Secret e Item ID; o formulário valida com a API antes de salvar, permite escolher a conta e exige autorização para o financeiro da equipe. GET /v2/items não está disponível nesse caminho; não tente enumerar itens. Trocar a conexão pode manter as credenciais atuais em branco e usar outro Item ID. Desconectar elimina as credenciais da DUUK, conservando OFX/lançamentos e o consentimento externo, administrado no portal.

Credenciais ficam no Vault, em configuração singleton privada. A Edge Function `duuk-pluggy` exige Supabase Auth e Financeiro em cada ação; configuração/desconexão também exigem super administrador e revisão. A RPC `duuk_pluggy_backend` é exclusiva de service_role, repete a autorização e nunca retorna segredos ao frontend. O extrato verifica a conta/conector a cada leitura e a revisão/permissão antes de entregar a resposta. Não guarda extratos online no banco, em localStorage ou Cache Storage, nem os envia ao Gemini. Retorna somente os campos necessários, excluindo CPF, titular, conta completa, cartão e contrapartes.

Paginação oficial /v2/transactions limitada a dez páginas/5.000 movimentos por mês, com deduplicação, proteção de origem/conta/cursor e aviso explícito de resultado parcial. Datas seguem America/Sao_Paulo, com margem de um dia na consulta remota para cobrir viradas UTC. API/credenciais/limites indisponíveis aparecem como erros; dados anteriores continuam visíveis com exportação bloqueada. A cota de leitura por membro é 30 consultas por minuto, com timeout total de 45 s; não faça polling frequente ou sincronização artificial no banco.

A conta pessoal Nubank do proprietário foi conectada **apenas para teste**, conforme autorização explícita. Pode ser substituída pela conta da empresa em Integrações. Não trate a conexão atual como PJ nem conecte contas pessoais de outros membros automaticamente. Em 14/10/2026, o conector 200 retornou UPDATED/SUCCESS, uma conta bancária, saldo válido e seis movimentos de outubro pelo endpoint DUUK autenticado, HTTP 200. A recorrência futura de 24 h e a conexão PJ ainda dependem do provedor/novo consentimento e não foram validadas durante esse teste.

Arquivos OFX agora têm Importações recentes > Ver movimentos / Remover importação com confirmação. `duuk_remove_bank_import` apaga apenas metadados/movimentos dessa importação, conserva receitas/despesas e audita a remoção privada. Um recibo privado bloqueia reenvios atrasados da solicitação antiga; escolher o arquivo de novo é uma nova importação intencional. Novos nomes armazenados são canônicos, sem o número da conta que pode aparecer no nome original do arquivo. Ao importar, o mês do arquivo abre automaticamente, e o período escolhido permanece no endereço.

Migrações: `20261014060244_duuk_bank_import_removal.sql` e `20261014062607_duuk_pluggy_readonly.sql`. Fixtures com rollback: `supabase/tests/bank-import-removal.sql` e `supabase/tests/pluggy.sql`; regressão `supabase/tests/bank-ofx.sql`. A ajuda estática DUUK AI foi atualizada, preservando ferramentas e restrição de dados financeiros.

## Cobranças Asaas · 2.6.0

Menu Gestão > Cobranças, protegido por Financeiro e MFA, com Pix/boleto/cartão por fatura externa. Conta recebedora empresarial da DUUK. Produção conectada em 19/10/2026 após SMS do proprietário: CNPJ empresarial, cadastro APPROVED, chave no Vault sem operações de saque e webhook Ativado. A chave do Sandbox e a homologação de emissão/liquidação/cancelamento nesse ambiente continuam pendentes. Nenhum recebimento, cobrança real ou serviço adicional pago foi realizado. Guia completo: `docs/asaas-billing-setup.md`.

Credenciais no Vault, tabelas privadas com RLS, RPC exclusiva do servidor, webhook autenticado/deduplicado e consulta canônica antes de atualizar. Timeout não repete criação automaticamente. CONFIRMED difere de RECEIVED. Não grava CPF/CNPJ/cartão nem cria receitas/despesas automaticamente. Produção exige revisão e aceite das tarifas do Asaas; links são compartilhados manualmente. A conexão pode ser removida preservando faturas/histórico, e a conta original é exigida para reconectar. Cron por minuto reutiliza a infraestrutura gratuita existente.


Na 2.6.1, entrar em Cobranças sem ambiente explícito abre a conta central de Produção configurada, para qualquer membro autorizado com Financeiro. A conexão é única por ambiente, não por pessoa. Hoje há dois membros ativos com Financeiro e três ativos no total; os acessos foram preservados. Sandbox permanece acessível pela seleção explícita. A chave exclusiva vence em 19/10/2027 às 23:59 segundo a interface Asaas, e precisa de renovação antes dessa data. Nenhuma cobrança real foi emitida para validar a conexão.

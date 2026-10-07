# Operação do DUUK Admin

## Acesso e autorização

O painel está em `https://www.duukfilms.com/admin`. O site institucional não contém links para ele. As contas individuais solicitadas foram criadas no Supabase Auth, sem senhas no repositório. As contas e permissões são administradas pelo usuário em Configurações; não reative uma conta desativada para executar testes.

Em Configurações, o administrador pode gerenciar usuários, grupos e exceções individuais. Uma exceção de bloqueio prevalece sobre o grupo; super administradores mantêm acesso completo. O banco impede desativar ou rebaixar o último super administrador. Desativar uma conta bloqueia as operações no servidor imediatamente; a interface revalida o contexto ao focar e a cada minuto.

RLS protege os registros privados e as Edge Functions validam o usuário ativo e a permissão. As tabelas de configuração, subscriptions, fila e cursor são acessíveis exclusivamente pelo backend. O advisor informa ausência de policies nessas tabelas porque esse bloqueio é intencional. O aviso existente sobre proteção contra senhas vazadas depende do plano do Supabase; o projeto continua gratuito.

## Conteúdo e módulos

Salvar portfólio ou abertura publica o conteúdo numa única transação, com controle de revisão. Rascunhos e arquivados ficam privados. Uploads diretos continuam limitados a 50 MB por arquivo e ao espaço disponível do plano gratuito; vídeos maiores podem usar YouTube.

CRM usa clientes, atividades, follow-ups, histórico e etapas reais. Mudanças de pipeline e conclusões de follow-up verificam a revisão atual. O pipeline move o cartão imediatamente, sinaliza o salvamento e confirma com o registro retornado pelo servidor; falhas devolvem o cartão e recarregam os dados. A alça permite arraste por mouse ou toque, com rolagem horizontal nas bordas. Escape cancela o arraste; o seletor de etapa oferece uma alternativa por teclado. O sistema não contém leads de demonstração permanentes.

Login mobile exibe a foto de bastidores com a logo original. A abertura e a atualização do aplicativo usam o mesmo carregamento, com saída gradual e respeito à preferência por movimento reduzido. Atualizações de dados mantêm listas e valores visíveis; os placeholders aparecem apenas na primeira consulta ou ao mudar de mês.

Contratos preservam PDFs privados, campos, links separados com validade de sete dias, aceite e desenho. Lixeira revoga links e permite restaurar. Exclusão definitiva exige ausência de assinaturas. Não há certificado ICP-Brasil nem verificação de identidade por e-mail.

Despesas exportam Excel/CSV conforme mês e filtro. A agenda usa horários de Brasília. Insights excluem administrativo e assinaturas; retenção de 90 dias e limpeza diária de chaves temporárias derivadas do IP permanecem ativas.

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

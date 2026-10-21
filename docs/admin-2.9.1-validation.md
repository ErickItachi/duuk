# DUUK 2.9.1 — leitura de e-mails e indicadores por módulo

## Leitor

O problema vinha de duas camadas: a limpeza dos e-mails recebidos removia todos os estilos de diagramação e o documento do leitor impunha `width:100%` e `table-layout:fixed` a todas as tabelas, inclusive às tabelas internas usadas para centralizar o conteúdo. Isso distribuía colunas igualmente e espremia o texto.

`cleanReceivedMailHtml` agora mantém uma lista restrita de estilos de tipografia, espaçamento, cores e tabelas. Larguras fixas de tabelas passam a ser máximos preferidos, com largura relativa, para caber no leitor. Colunas e alinhamentos do remetente são preservados. O sanitizador do editor/envio continua separado e não foi ampliado. O layout não é uma cópia integral do Titan: estilos globais do remetente e recursos externos continuam bloqueados.

O leitor usa layout automático das tabelas e segue o tema do painel, adaptando cores neutras, inclusive RGBA usadas por mensagens do Google. Cores de marca e rótulos brancos são conservados. **Visual original** usa as cores originais como fallback; **Ampliar mensagem** ocupa a largura útil do workspace no desktop e **Mostrar lista** restaura a lista. Nenhum endereço ou credencial de caixa foi alterado.

HTML continua em iframe com origem opaca, sem scripts, formulários ou acesso ao painel. CSP própria proíbe recursos externos e imagens; links HTTP(S)/mailto exigem ação da pessoa e abrem com noopener/noreferrer. URLs remotas em CSS, eventos, scripts, SVG e formulários não passam no sanitizador. A nota sobre imagens bloqueadas foi preservada. Não foi criada permissão de acesso ao DOM/tokens do Admin.

Backend publicado separadamente: `duuk-mail` versão 20, ACTIVE, com `verify_jwt:false` preservado e autenticação/autorização próprias. Somente o ponto de leitura recebeu o novo sanitizador; Vault, TLS, Cc/Cco, anexos, resposta, encaminhamento e Enviados continuam iguais.

## Indicadores

`duuk_notification_summary()` retorna o total exato de notificações não lidas e a contagem por destino, independentemente das cem notificações carregadas na lista. Destinos de contratos, agenda, comercial, financeiro, cobranças, conteúdo, Drive e configurações usam o caminho mais específico. Queries e fragmentos não misturam os módulos. Avisos sem um destino específico continuam no sino.

Bolinha laranja no ícone, nome acessível indicando pendências, menu recolhido, drawer e atalhos mobile compartilham o mesmo resumo. Grupos fechados mostram um indicador; o botão Menu do celular sinaliza pendências em módulos que não estão nos atalhos. Não são criadas notificações artificiais por navegar. Marcar uma notificação como lida ou todas como lidas atualiza os indicadores.

Na Central de atendimento o resumo também consulta a existência de mensagens recebidas ainda não vistas pela pessoa. Reações, mensagens de sistema, conteúdo apagado e histórico importado não acendem a bolinha. A leitura da conversa atualiza o resumo imediatamente; leitura das notificações não envia recibos de WhatsApp. A conexão Meta real continua pendente e este trabalho não a ativa.

Implementação privada `SECURITY DEFINER`, sem argumentos de usuário, guardada por `auth.uid()` e `duuk_private.has_permission`, com autorização por módulo; wrapper público `SECURITY INVOKER` executável somente por authenticated. Sem acesso novo às tabelas privadas, mensagens, fotos ou credenciais. Sem chamadas adicionais a IMAP, Meta ou outros provedores para calcular os indicadores. Atualizações usam o Realtime/foco/rede e o intervalo de trinta segundos existentes.

Migração aplicada: `20261021232233_duuk_notification_module_summary.sql`, idêntica a `notification-summary.sql`. As duas versões locais disponíveis do CLI falharam por incompatibilidade com bibliotecas do macOS; a criação/aplicação foi feita pelo MCP oficial e o arquivo usa a versão retornada pelo histórico de migrações do servidor.

## Verificação

- 270 testes Node passaram; um opt-in anterior ignorado. Dois testes novos cobrem isolamento do documento, diagramação e cores neutras, RGBA e cores de marca.
- Dez testes Deno passaram, incluindo formatação recebida, ataques por HTML/CSS e regressão de envio MIME, Bcc e anexos. Type check da função passou. Lock inclui os tipos Node resolvidos durante a verificação.
- Fixture SQL real com rollback passou antes e depois da migração: 150 e-mails fora do limite da lista, total exato, destinos, leitura, isolamento entre usuários, bloqueio individual de Financeiro/WhatsApp, sessão alheia, AAL1 e sessão expirada, além do cursor de leitura da Central e exclusão de histórico/reações. Nenhuma mensagem ou push real foi enviado.
- Lint mantém somente os três avisos anteriores do site público. Build isolado passou com o aviso anterior de tamanho de chunk; alterações locais de contratos foram excluídas do artefato.
- Navegador com APIs e dados fictícios verifica 320, 390, 768 e 1440 px, claro/escuro, largura do conteúdo, cores RGBA, ampliação, ícones/menu recolhido e leitura independente. O relógio do Playwright tenta inicializar também no iframe opaco; a recusa explícita de script pelo sandbox é esperada e não foi contornada. Não há acessos aos recursos do remetente.

O teste `tests/e2e/mail-notification-modules.mjs` prepara o HTML fictício com o sanitizador real em Deno e usa o build isolado pelo preview. Requer Deno no PATH ou `DUUK_DENO_PATH`, além do Chrome usado pelas demais verificações. `DUUK_MAIL_CASES` permite selecionar cenários, como `320-dark,1440-light`.

Reversão: frontend anterior 2.9.0 e leitor `duuk-mail` v17, com o sanitizador anterior; a nova RPC pode permanecer instalada sem uso. Não revogue credenciais para reverter layout.

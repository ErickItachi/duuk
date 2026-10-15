# DUUK Admin 2.3.0 — 15/10/2026

O Financeiro usa vermelho para despesas/saídas e verde para entradas, incluindo KPIs, ícones, valores, barras e legendas. Sinais, palavras, privacidade dos valores e as fontes do Meu Pluggy foram preservados. O banner da Visão geral tem foto com transição mais suave e uma identificação discreta do estúdio.

A IA abre no desktop como painel fixo à direita, da borda superior à inferior, sem alça ou coordenadas de arraste. Posições antigas da janela são ignoradas; somente o botão de acesso continua movível. Celular mantém teclado, safe areas e proteção de rascunhos. O botão tem nova superfície escura, ícone de conversa e detalhe laranja. Continua oculto sob qualquer diálogo. O carregamento contém somente o PNG original da logo, círculo laranja de 14 px e o texto da etapa real; não há atraso artificial, brilho, moldura ou faixa. A marca do menu fica sem fundo também no hover e foco.

A conferência do primeiro deploy detectou a janela automática de novidades reintroduzida no código anterior. O provider da PWA deixou de montá-la e Sobre não exibe notas/histórico. O aviso simples e a atualização explícita continuam, com proteção de formulários; a instalação usa o mesmo loader mínimo do painel.

## Notificações

Migração aplicada: `20261015062459_duuk_notifications_resources.sql`. Cinco triggers acrescentam avisos futuros sobre:

- Receita/despesa criada ou removida, recebimento/pagamento confirmado, baixa desfeita e vencimento alterado.
- Metas e orçamento do mês atualizados ou removidos.
- Instagram agendado, reagendado, cancelado, publicado ou com falha.
- Conta central Meu Pluggy trocada ou removida.

Não há backfill nem alertas fabricados sobre produção do portfólio. As inserções participam da transação original e usam permissões ativas, preferências, exclusão do próprio ator e chaves únicas. Social Media ganhou categoria e preferência próprias; os avisos existentes do worker foram mantidos nessa categoria. A chave de publicação/falha é a mesma do worker, impedindo aviso duplicado ao solicitante. Erros, conteúdo de legendas, credenciais e valores financeiros não são copiados para novas notificações genéricas.

O som é sintetizado localmente: duas notas curtas, após o primeiro gesto permitido pelo navegador, apenas para itens recentes e não lidos recebidos com a página visível. Primeira carga, histórico, atualização de leitura e reconexões antigas ficam silenciosos. Web Locks e um registro limitado de IDs/timestamp coordenam as abas; não se guarda corpo/título da mensagem. A preferência é por conta/aparelho, com controle e prévia em Configurações > Notificações. Com o app fechado, o push usa as convenções do sistema: a [API de notificações](https://notifications.spec.whatwg.org/#dom-notification-silent) não permite escolher um arquivo de som personalizado. O áudio segue as [restrições de reprodução do navegador](https://developer.chrome.com/blog/autoplay/#web-audio).

## E-mail e assinatura

A logo original identifica `contato@duukfilms.com` no app, na caixa, no remetente e no composer. Remetentes externos continuam com iniciais; nomes de exibição não podem imitar a imagem da DUUK e nenhuma foto externa é buscada automaticamente. No Titan, a foto DUUK foi salva pelo editor oficial da conta autenticada e conferida após recarregar. Essa foto depende dos clientes de e-mail dos destinatários; [o Titan explica o alcance da foto](https://support.titan.email/hc/en-us/articles/12499761435545-Profile-picture-for-your-Titan-account).

`duuk-sign` versão 8 ACTIVE, com `verify_jwt=false` preservado e a validação própria de links/códigos. O novo HTML é responsivo, com marca original, cores DUUK, código copiável e validade de dez minutos. O único recurso externo é a imagem estática pública da logo, sem parâmetros ou rastreamento. Texto simples, destinatário único, transporte TLS, limites, idempotência e confirmação SMTP permanecem. E-mails não incluem documento, link privado, código em URL nem anexo. Não foi enviado e-mail real de teste.

## Verificação e reversão

- Node 22.23.3: 205 testes, 204 aprovados e um opt-in anterior ignorado.
- Lint: apenas os três avisos anteriores em Site/i18n. Build aprovado, com aviso anterior de tamanho dos chunks.
- `tests/e2e/dashboard-ai.mjs`: temas claro/escuro em 320, 390, 768 e 1440 px; rascunho, teclado mobile e painel lateral. `tests/e2e/refinements.mjs`: cores, identidade da caixa, loader, e-mail de código e áudio local sem push real.
- `supabase/tests/notification-resources.sql`: rollback integral, permissões, opt-out, atores, membros inativos, transições, deduplicação com o worker, metas, conexão bancária e RLS da nova preferência.
- Advisor: nenhum dos quatro novos helpers exposto; avisos anteriores de tabelas privadas sem policies, funções administrativas autorizadas e proteção de senha permanecem, sem habilitar recursos pagos.
- Função de assinatura rejeita token malformado com HTTP 404, sem disparar código. Interfaces usam dados isolados e áudio simulado; não houve envio real de WhatsApp, e-mail ou push.

Evidências locais: `/tmp/duuk-2.3-refinements` e logs `/tmp/duuk-2.3-*`. Prévia do e-mail usa exclusivamente o código fictício `000000`. As alterações locais anteriores em `ContractsPage.jsx` e `tests/e2e/contracts.mjs` permanecem fora desta entrega.

Reversão: promover o frontend 2.2.0 na Vercel; para os novos geradores, usar `supabase/rollbacks/20261015062459_duuk_notifications_resources_down.sql`, que conserva o histórico e as preferências. Para o HTML anterior, restaurar somente `sign-verification.mjs` da 2.2.0 e republicar `duuk-sign` com suas dependências. A PWA mantém atualização explícita e proteção dos formulários.

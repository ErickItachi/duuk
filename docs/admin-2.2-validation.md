# DUUK Admin 2.2.0 — 15 de outubro de 2026

A Visão geral usa a foto de bastidores já existente da DUUK, mantendo o PNG original da marca. Os novos cartões mostram agenda dos próximos sete dias (compromissos únicos, barras por dia), oportunidades abertas (distribuição entre abertas, ganhas e perdidas) e visualizações públicas dos últimos 30 dias. Contas sem Insights recebem o resumo de contratos quando permitido. Os gráficos reutilizam consultas autorizadas; não acrescentam chamadas, dados fictícios ou envio de registros à IA. Falha não é apresentada como zero; consultas vazias mostram zero; erros de atualização conservam a última consulta.

A janela flutuante da IA ganhou atalhos de roteiro, conceito, ajuda e revisão de texto, superfícies com textura e acento DUUK. O botão flutuante fica invisível enquanto qualquer diálogo nativo está aberto. O celular usa a área visível da tela com margens e safe areas, incluindo ajuste ao teclado. Histórico, privacidade, confirmação de ações, rascunhos e movimentação da janela no computador permanecem nos fluxos existentes.

A pedido do usuário, o Admin usa fundo e sublinhado para foco por teclado, sem moldura de contorno. Botões secundários usam preenchimento; as áreas com tracejados decorativos passam a ter borda contínua. As regras ficam limitadas às superfícies administrativas e aos campos do visualizador; o site institucional conserva sua aparência.

Validação local em Node 22.23.3:

- `npm test`: 200 testes, 199 aprovados, um opt-in anterior ignorado.
- `npm run lint`: três avisos anteriores em Site/i18n, nenhum novo.
- `npm run build`: aprovado; aviso anterior sobre tamanho dos chunks.
- `tests/e2e/dashboard-ai.mjs`: 320, 390, 768 e 1440 px, temas claro/escuro, foto carregada, gráficos, diálogo de compromisso ocultando o botão da IA, janela dentro da tela, teclado mobile simulado, seleção de roteiro, proteção de rascunho e foco sem contorno. Cenários de acesso restrito, fonte indisponível, fonte vazia e movimento normal/reduzido.
- Varredura adicional em IA, Financeiro, Contratos, clientes, Social Media e Drive: 320 e 1440 px, sem erro de JavaScript nem vazamento horizontal.

Os testes de interface usam exclusivamente os mocks isolados. Evidências locais em `/tmp/duuk-dashboard-ai`, `/tmp/duuk-2.2-sweep` e logs `/tmp/duuk-2.2-*`. Alterações locais anteriores em `src/office/ContractsPage.jsx` e `tests/e2e/contracts.mjs` não fazem parte desta entrega.

Para reversão do frontend, promover o deployment anterior da Vercel. Esta versão não altera schema nem Edge Functions. A atualização da PWA continua explícita e preserva formulários pendentes.

## Reconexão bancária autorizada

Em 15/10/2026, a sessão do usuário no Chrome confirmou uma conexão Nubank Empresas ativa no Meu Pluggy. O proxy anterior na aplicação Demo já não devolvia contas. O fluxo oficial de conexão MeuPluggy criou um novo proxy; o formulário autenticado da DUUK validou e selecionou a conta final `00-4`, reaproveitando as credenciais existentes no servidor. A configuração foi salva pela transação oficial e conferida no banco como revisão 3, com novo item e conta. Não houve leitura de segredo do Vault, rotação de credenciais, contratação, pagamentos ou criação de lançamentos. A atualização da origem permanece diária, conforme o [guia oficial do Meu Pluggy](https://meu.pluggy.ai/api-guide).

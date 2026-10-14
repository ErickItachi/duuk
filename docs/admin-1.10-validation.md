# DUUK Admin 1.10.0 — validação antes da publicação

Data: 14 de outubro de 2026. Base: `4a8491ce3c2215cd12e996e474d5f9d4a8b58eaa` (1.9.3). Checkout: `duuk-admin-live`, branch `feature/duuk-platform`. Build local: `cd240017c2532d1db215`.

## Escopo

Interface do Admin refinada nas cores da DUUK, resumo integrado com progresso real e Financeiro com receitas, despesas existentes, fluxo por data efetiva, metas mensais e Excel/CSV. Nenhuma alteração de conteúdo ou fonte do site institucional, logo, autenticação, assinaturas, Calendar, Drive, e-mail, notificações ou ações permitidas da IA. O cadastro de despesas anterior foi reutilizado, com vencimento inicial opcional no novo módulo.

## Verificações executadas

- Node 22: 134 testes, 133 aprovados e um teste de integração antigo opt-in ignorado. Inclui datas/mês/leap year, diferença entre vencimento e liquidação, filtros, valores monetários, metas e proteção de textos exportados. Os testes de roteamento da IA cobrem ajuda financeira, permissões e preservação de pedidos comerciais/criativos.
- Lint: sem erros; três avisos anteriores em `i18n.jsx` e `components/Site.jsx`.
- Build de produção: aprovado. Vite mantém aviso sobre chunks maiores que 500 kB. O projeto frontend usa JavaScript/JSX, sem comando independente de TypeScript. A Edge Function existente manteve seus arquivos TypeScript e foi compilada/publicada pelo Supabase.
- Fixture SQL `supabase/tests/finance-income-goals.sql`: aprovado com rollback. Exercita RLS para membro financeiro, membro sem acesso, desativado e anônimo, proteção de colunas/atribuição, revisão, limites e datas, auditoria e compatibilidade das despesas antigas. Nenhum registro de QA permaneceu no banco.
- Migração aplicada: `20261013213527_duuk_finance_income_goals.sql`. Advisors posteriores não apontaram novas falhas de segurança nas entidades financeiras; os índices recém-criados ainda sem uso aparecem como informação, antes da publicação do frontend.
- Navegador com build de produção e Supabase totalmente interceptado: 63 casos financeiros aprovados, sem erro JavaScript ou operação inesperada. Quatro abas em 320/390/768/1440 px, claro/escuro; criação, baixa, reabertura, exclusão, conflitos e rascunhos; metas em meses distintos; falhas de leitura; CSV filtrado e Excel real baixado/descompactado com quatro planilhas XML e valores conferidos. Novos lançamentos em novembro começam com vencimento em novembro sem gravar registros. Movimento reduzido aprovado. A revisão visual adicional incluiu 1024 px.
- Regressões finais: quatro casos do editor de e-mail em 320/390 px nos dois temas, nove de ajuda móvel/arrastável e 25 de loader, novidades, banner/Sobre, atualização e proteção de formulários. Sem mensagens, geração de IA, gravações, push ou assinaturas reais.
- Revisão dos módulos durante o desenvolvimento: 211 verificações em 14 rotas e formulários, incluindo canvas de PDF, calendário, e-mail, Drive e IA, nos dois temas; 15 verificações de menu/logo/cabeçalho, recolhimento e movimento reduzido. Os ajustes posteriores específicos foram cobertos pelas regressões finais acima.
- Ajuda DUUK AI: função `duuk-ai` v7 ACTIVE; arquivos remotos conferidos contra o checkout. Somente manual e roteamento estático mudaram. Status anônimo continua 401. Prompt mestre, consentimento, cota, tokens protegidos e ferramentas anteriores preservados; não foram enviados dados financeiros privados ao Gemini.
- Preservação: consulta final confirmou três despesas anteriores, zero receitas e zero meses de metas antes do uso da nova versão. Não foram criados dados de demonstração em produção.

## Limites e publicação

O financeiro é manual, sem banco conectado, saldo inicial, conciliação automática ou realização de pagamentos. Fluxo e metas usam recebimentos/pagamentos efetivos; o resumo previsto usa vencimentos. A qualidade de valores reais depende dos lançamentos da equipe.

As verificações de interface e gravação foram feitas em fixtures isoladas; os testes de autorização/gravação SQL usaram rollback no projeto existente. Não é declarado como aprovado um envio financeiro real ou uma operação externa não executada.

Depois do push, conferir status da Vercel, `admin-version.json`, service worker, sessão autenticada em `/admin/financeiro` e site público. A atualização instalada deve mostrar 1.10.0/build `cd240017c2532d1db215`, preservar formulários pendentes e apresentar as novidades somente uma vez por conta/versão/aparelho. As evidências de publicação são registradas na sessão e nos artefatos locais de validação, após o deploy.

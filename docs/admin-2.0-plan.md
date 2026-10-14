# DUUK Admin 2.0 — plano e progresso

Pedido de Gustavo em 14/10/2026: reformular todo o administrativo (identidade visual, navegação, módulos, responsividade, animações, carregamento, temas) e criar o módulo Social Media com a API oficial do Instagram. Este arquivo registra o diagnóstico, as decisões e o andamento de cada etapa.

## Ponto de recuperação

- Versão publicada antes da reformulação: Admin 1.12.0, commit `ba229ab` em `main` (PR #1). A Vercel mantém essa implantação e permite promovê-la de volta sem novo build.
- A 2.0 é desenvolvida no branch `claude/financeiro-redesign-84edvk`, com pull request e prévia da Vercel. Nada chega a `main` antes dos testes.
- Mudanças no banco são somente aditivas (tabelas, colunas, chave de permissão e jobs novos). Cada migração tem script de reversão em `supabase/rollback/`. Nenhum dado existente é apagado ou reescrito.
- Funções existentes (`duuk-ai`, `duuk-pluggy` e demais) não são reimplantadas por esta reformulação. O Social Media usa uma função nova, `duuk-social`.

## Diagnóstico (etapa 1)

**Stack.** React 19, Vite 8, React Router 7, lucide-react, Supabase (Auth, Postgres com RLS, Vault, Storage, Cron/pg_net, Realtime Presence, 10 Edge Functions em Deno), Vercel publicando `main`. PWA própria em `/admin/` (`admin-sw.js`, atualização explícita). Fontes Inter e Inter Tight locais e variáveis (100–900).

**Dados reais (consulta de leitura em 14/10).** 4 perfis (1 superadministrador), grupos Administrador, Comercial e SubAdministrador, 18 chaves de permissão. Storage usa cerca de 4 MB dos 1 GB gratuitos. Cron: agenda e Drive a cada minuto, notificações a cada 5 minutos, duas retenções diárias. Banco com 32 MB.

**Módulos.** Visão geral; Comercial (painel, clientes, pipeline, contatos, modelos, follow-ups, e-mails Titan, relatórios); Contratos com assinatura; Agenda com Google Calendar; Financeiro 1.12 com Meu Pluggy; Insights do site; DUUK AI (Gemini); Google Drive; Site (portfólio, abertura, mídias); Configurações (usuários, grupos, permissões, notificações, integrações, histórico, sobre, perfil); notificações push; página pública de assinatura.

**Problemas encontrados.**

1. Estilo em camadas: `admin.css` + `platform.css` + `office.css` + `theme.css` (modo claro por sobrescrita) + `visual-system.css` + `module-surfaces.css` + `dashboard-experience.css` e CSS por módulo. São cerca de 650 cores fixas fora de variáveis, o que causa diferenças entre temas e entre módulos.
2. Identidade atual em coral/laranja com gradientes em botões, indicadores e fundo; o pedido agora é neutro, com acento pontual.
3. Carregamento com atraso artificial de 900 ms antes de entrar no painel.
4. Tema só claro/escuro; não acompanha o aparelho.
5. Fontes declaradas apenas nos pesos 500/600, apesar de os arquivos serem variáveis.
6. Menu longo, com itens soltos e grupos parciais; cabeçalho com ações duplicadas (tema no menu e no topo).
7. Listas sem paginação (exceto Drive) e sem padrão comum de busca/filtros; no celular algumas tabelas dependem de rolagem horizontal.
8. Visão geral com indicadores fixos; não mostra follow-ups, negócios em andamento, atividade recente nem resumo financeiro do mês.
9. Sem busca global nem atalhos de teclado; avisos (toast) únicos e sem fila.

**Reaproveitar.** Autenticação, permissões (frontend, Edge Functions e RLS), APIs e regras de negócio de todos os módulos, PWA e atualização, notificações, AI, Financeiro 1.12, Drive, assinatura, padrões de Vault e Cron.

**Reconstruir.** Camada visual (tokens, componentes, CSS por módulo), shell (menu, cabeçalho, navegação móvel), carregamento, login, alternância de tema e Visão geral.

## Decisões

- **Identidade 2.0.** Preto, branco e cinzas neutros; o coral DUUK fica como único acento (ponto da marca, estados ativos discretos, gráficos de destaque). Status (sucesso, atenção, erro, informação) sempre com ícone ou texto além da cor. Sem gradientes decorativos e sem emojis como ícones. Logo original preservada: PNG branco no escuro e `brightness(0)` no claro, sem caixa de fundo.
- **Tipografia.** Inter variável 400–600 para interface; Inter Tight 600 para títulos. Escala 12/13/14/16/20/24/32.
- **Tokens.** `src/admin/ds/tokens.css` define cores, superfícies, bordas, texto, espaçamento, raios, sombras e movimento para escuro e claro. As variáveis antigas (`--admin-*`) passam a apontar para os tokens.
- **Componentes.** Botões, campos com validação, selects, abas/segmentos, badges, cartões, lista/tabela com busca, filtros e paginação (cartões no celular), estados vazios, skeletons, diálogo de confirmação para ações destrutivas, menu suspenso, avisos em fila.
- **Navegação.** Grupos: Principal (Visão geral, Agenda, DUUK AI), Comercial, Gestão (Contratos, Financeiro), Conteúdo (Social Media, Site DUUK, Insights) e Google Drive como último item, conforme regra 1.6.0. Configurações e perfil ficam no rodapé do menu. Menu recolhível no desktop, trilho de ícones no tablet, gaveta animada e barra inferior no celular.
- **Carregamento.** Sem tempo mínimo. A barra de progresso avança apenas em etapas reais (aplicativo, sessão, permissões, módulo). O painel aparece assim que estiver pronto; a saída é uma transição curta que não bloqueia interação.
- **Tema.** Claro, escuro ou sistema, salvo por conta e aparelho. Troca sem componentes quebrados (transições suspensas durante a troca) e com animação sol/lua respeitando movimento reduzido.
- **Social Media.** API do Instagram com login do Instagram (`graph.instagram.com`). Detalhes abaixo.

## Social Media (Instagram)

**Permissões solicitadas:** `instagram_business_basic` (perfil, mídias, renovação do token), `instagram_business_content_publish` (publicar) e `instagram_business_manage_insights` (métricas). Comentários e mensagens não são necessários agora e não serão pedidos.

**Acesso.** Em modo de desenvolvimento, com Standard Access, funciona para contas com função no app (testador do Instagram) e contas que a DUUK administra. Contas de clientes exigem Advanced Access, App Review e verificação da empresa; a arquitetura já separa contas por proprietário para essa etapa.

**Fluxo de conexão.** Superadministrador informa Instagram App ID e App Secret no próprio painel (Vault; nunca no chat, no navegador ou no repositório). A URI de redirecionamento é a própria função: `https://ilohuxhyfqikjlvoarts.supabase.co/functions/v1/duuk-social/oauth`, válida para produção e prévias. O código vira token de longa duração (60 dias), renovado automaticamente pelo servidor.

**Publicação e agendamento.** Foto (JPEG convertido no navegador), carrossel (2–10 itens), Reels e Stories. Contêiner → verificação de status → `media_publish`, executados pelo Cron no servidor, mesmo com o painel fechado. Proteções: bloqueio por publicação, conferência do status `PUBLISHED` antes de qualquer nova tentativa, limite diário consultado na API, tentativas com espera crescente e notificação de sucesso ou falha. Nenhuma publicação sai sem ação explícita (publicar agora ou agendar).

**Mídia.** Bucket privado `duuk-social` no Storage existente, com links assinados temporários para a Meta buscar o arquivo. Limite de 50 MB por arquivo no plano gratuito (Reels maiores precisam ser comprimidos antes).

**Métricas.** Somente valores retornados pela API: perfil (seguidores, publicações), métricas da conta (`reach`, `views`, `accounts_engaged`, `total_interactions`, `likes`, `comments`, `shares`, `saves`, `follows_and_unfollows`) e de cada mídia (`reach`, `views`, `likes`, `comments`, `shares`, `saved`, `total_interactions`). Crescimento de seguidores vem de registros diários feitos pelo servidor a partir da conexão. Métricas indisponíveis (menos de 100 seguidores, atraso de até 48 h, carrossel sem métricas) aparecem como indisponíveis, nunca como zero.

## Etapas

- [x] 1. Diagnóstico
- [ ] 2. Nova base visual
- [ ] 3. Reformulação estrutural (menu, cabeçalho, celular, carregamento, login, tema)
- [ ] 4. Reformulação dos módulos
- [ ] 5. Responsividade
- [ ] 6. Social Media
- [ ] 7. Refinamento e animações
- [ ] 8. Testes (Playwright, larguras 320–1440, dois temas)
- [ ] 9. Validação final

## Depende de Gustavo

1. No app da Meta: produto Instagram → configuração da API com login do Instagram.
2. Adicionar a conta profissional da DUUK como testador do Instagram (Funções do app) e aceitar o convite no Instagram.
3. Em configurações do login comercial, cadastrar a URI de redirecionamento acima.
4. Depois que a 2.0 estiver na prévia: informar Instagram App ID e App Secret em Social Media → Conexão e autorizar a conta.
5. Autorizar explicitamente qualquer publicação real de teste.

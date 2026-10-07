# DUUK Admin — arquitetura

Análise em 6 de outubro de 2026, a partir do commit `9fb78ab` e do projeto Supabase conectado. O checkout original contém alterações anteriores; o trabalho usa `duuk-admin-live`.

A ampliação 1.0.0 foi concluída em 7 de outubro de 2026. A seção “Base existente” registra o ponto de partida; as decisões abaixo estão implementadas. Operação e configurações externas estão em [duuk-admin-operation.md](duuk-admin-operation.md).

## Base existente

- React 19, Vite 8, React Router 7, CSS e fontes Inter/Inter Tight locais. O site usa MP4/HLS e YouTube, com capas e carregamento por visibilidade.
- Supabase Auth verifica a sessão com `getUser`; a autorização atual usa `duuk_admins`. Sessões ficam no armazenamento do navegador; senhas nunca são persistidas pela aplicação.
- Conteúdo do site é um documento versionado, com publicação atômica e atualização via Realtime. Biblioteca privada, limites de arquivo e proteção de mídias em uso já existem.
- Banco com RLS: conteúdo, biblioteca, contratos, convites, assinaturas, despesas, agenda e métricas. Contratos/assinaturas passam por Edge Functions. Despesas e agenda usam permissões por coluna e revisão otimista.
- Contratos têm PDFs privados, links de sete dias, assinaturas por aceite/desenho e lixeira. Evidências assinadas não podem ser apagadas definitivamente. Existe um contrato real; preservá-lo e preservar todos os dados existentes.
- Métricas públicas agregadas ficam por 90 dias; Supabase Cron já executa retenção. Vault está disponível para segredos criptografados. Não há CRM, perfis, grupos, e-mails, PWA, Service Worker ou push.
- Vercel publica `origin/main`. CSP, noindex de rotas privadas e cache de mídias já estão configurados. O site público não expõe o endereço do administrativo.

## Decisões

1. Reutilizar os módulos, Auth, Supabase, modais, tipografia e marca existentes. Adotar Lucide como único conjunto de ícones de interface do administrativo.
2. Manter o acesso atual durante a migração. Perfis ativos, grupos e exceções individuais passam a determinar permissões. Bloqueios individuais prevalecem sobre permissões de grupo; superadministradores têm acesso completo. Acesso ao conteúdo do site é uma permissão conjunta para portfólio, abertura e biblioteca.
3. Validar autorização nas rotas, Edge Functions e RLS. Usuários não podem alterar seu grupo, estado ou privilégios pela tabela de perfil. Contas e senhas são gerenciadas exclusivamente por Supabase Auth no servidor.
4. Acrescentar CRM com clientes, atividades, etapas e follow-ups, revisão e auditoria. Mudanças de etapa são registradas no banco. Nenhum dado demonstrativo permanente será criado.
5. A caixa de e-mail é GoDaddy, confirmada pelo usuário e por DNS. Preparar IMAP/SMTP real no backend; a conexão requer credenciais da caixa configuradas como segredos no servidor. Não simular recebimento ou envio com textos no banco.
6. Uma única implementação de PWA, restrita a `/admin/`, com shell e assets versionados. Nunca armazenar APIs, PDFs, assinaturas ou dados privados em Cache Storage. Instalação de nova versão fica aguardando ação do usuário; considerar formulários pendentes antes de ativar.
7. Notificações internas e Web Push usam preferências, permissões, deduplicação e múltiplos dispositivos. VAPID privado e token do agendamento ficam no backend/Vault. Ativação é explícita, sem solicitar permissão na abertura.
8. Fonte única de versões e changelog, datas reais, novidades vistas por usuário. Offline permite abrir o shell e informa indisponibilidade dos dados; não permite gravar sem conexão.
9. O ícone fornecido é utilizado por redimensionamento proporcional, sem redesenhar a marca. Favicon e manifest do administrativo permanecem separados dos do site institucional.

## Validação por etapa

Lint, build, testes de regras e autorização, navegador desktop/mobile (320–1440 px), formulários/teclado, PWA/cache/atualização, notificações e ausência de segredos no bundle. Exercitar dados temporários identificados e remover somente esses registros. Não assinar, excluir ou alterar documentos reais como parte dos testes.

O projeto permanece gratuito; não habilitar cobrança, novos planos ou integrações pagas. A integração bancária anterior foi uma pergunta e não faz parte desta implementação.

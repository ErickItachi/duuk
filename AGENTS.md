# Fluxo de trabalho da DUUK

## DUUK AI — 1.8.0

- `/admin/ai` e ajuda contextual exigem a permissão `ai`. As conversas são privadas; documentos só são compartilhados por autorização explícita e pelas permissões atuais do projeto. Não enviar automaticamente registros comerciais, contratos, agenda, financeiro, credenciais ou valores de formulários ao modelo.
- A Edge Function `duuk-ai` verifica Supabase Auth e permissões no servidor. Usa Gemini oficial (`@google/genai` fixado), Vault e cotas por membro. Não ativar faturamento, contratar planos ou trocar para modelos pagos. Sem retry automático após erro de geração; manter reservas para consumo desconhecido após interrupção.
- Gemini conectado em 9 de outubro de 2026 na conta `duukfilms@gmail.com`, projeto `gen-lang-client-0425131914` no Nível gratuito e sem faturamento configurado no AI Studio. A chave de autenticação fica criptografada no Vault. Preserve suporte às novas chaves Google, sem exigir o prefixo legado. Roteiro, conceito, comercial e ajuda foram validados de verdade com dados fictícios, streaming e histórico persistente. Nunca pedir a chave pelo chat. Instruções e limites: `docs/duuk-ai-setup.md`. Preserve o prompt mestre integral; os complementos de segurança são versionados separadamente no mesmo arquivo e mantêm condições comerciais não confirmadas como `[a definir]`.

- O aceite de privacidade é persistido por membro e versão em `duuk_private.ai_consents`; instale `supabase/duuk-ai-consent.sql` depois da migração AI original. A RPC de consentimento é exclusiva do servidor. Nunca aceitar automaticamente, copiar aceite entre pessoas nem reativar aceite revogado pelo caminho de compatibilidade legado. Mantenha revogação e erros de gravação visíveis na interface.
- As instruções de qualidade em `duuk-ai-quality.mjs` complementam o mestre integral. O contexto detalhado contém no máximo três páginas relevantes, filtradas por permissões; o roteamento considera pedidos reais e histórico do membro. Preserve cotas, reservas conservadoras e escolha de modelo antes do envio ao Google, sem repetição automática. Foco de teclado no Admin usa indicação neutra; não restaure contornos vermelhos no composer nem altere o foco do site institucional.

- O usuário autorizou a IA a executar ações do administrativo. As ferramentas nativas Gemini são limitadas ao registro do backend: preparar compromissos, despesas e follow-ups e consultar um período de agenda. Preparar não grava: a confirmação no cartão executa a transação. O diário privado `duuk_private.ai_actions` impede duplicação e confere propriedade, mensagem ativa, validade e permissões atuais antes de cada execução/replay. `supabase/duuk-ai-actions.sql` deve vir depois das migrações AI e consentimento; aplique `supabase/duuk-ai-actions-lock.sql` em seguida para serializar confirmação com regeneração e exclusão de conversa. Preserve os triggers oficiais de auditoria, calendário e notificações, com ator autenticado definido no contexto local da transação.
- Os registros retornados pela consulta da agenda e as opções de responsáveis/clientes permanecem na interface DUUK; não são enviados ao Gemini. Ações de assinar contratos, enviar e-mails/mensagens, pagar, excluir registros ou alterar acessos não são ferramentas permitidas. Aplicativos antigos continuam sem funções de ação até atualizar para a interface que envia `actions_supported:true`.

## Site e painel publicados

O usuário autorizou publicar o painel administrativo em produção e aplicar as alterações ao site público ao salvar.

- O painel fica em `https://www.duukfilms.com/admin`, protegido por Supabase Auth e autorização no servidor.
- Não inclua links, botões ou avisos sobre o painel nas páginas públicas da DUUK.
- Preserve a logo original em `public/media/duuk-logo-white.png`, sem redesenhar, recolorir ou acrescentar outra marca. O administrativo usa a paleta e a tipografia do site da DUUK; verifique celular, tablet e desktop, incluindo menu, modais e PDFs.
- Salvar um projeto ou a abertura deve atualizar o site público numa única transação, sem um segundo botão de publicar. Projetos com status rascunho/arquivado continuam privados.
- Mantenha Supabase no plano gratuito. Não contrate serviços, aumente planos ou habilite cobrança. O usuário aceitou links do YouTube para vídeos grandes, inclusive na abertura, mantendo uploads diretos com limites gratuitos.
- Senhas e chaves de serviço não podem entrar no repositório nem no navegador.
- O usuário autorizou ampliar e publicar o administrativo: visão geral, PDFs e assinaturas, despesas e insights, mantendo o portfólio e a abertura.
- Os contratos começam com upload de PDFs prontos. Não implemente geração de modelos nesta etapa. Cliente e DUUK assinam por links privados separados, válidos por sete dias, compartilhados manualmente pelo administrador.
- Preserve o PDF, os campos e as assinaturas após gerar links. Assinaturas são eletrônicas por aceite e desenho, sem certificado ICP-Brasil nem verificação de identidade por e-mail. Não apresente o fluxo como assinatura certificada.
- O usuário autorizou a agenda e a exclusão de contratos: use lixeira com restauração e revogação dos links. Só permita exclusão definitiva sem assinaturas recebidas. Despesas exportam Excel e CSV conforme mês e filtro. A agenda usa horários locais de Brasília.
- O usuário escolheu o painel escuro, com preto, coral e laranja. O menu do desktop pode ser minimizado, preservando a navegação no celular.
- A integração com Nubank foi apenas uma pergunta: não conecte contas, solicite credenciais ou contrate provedores sem instrução do usuário.
- Contratos, evidências e despesas são privados. Insights contam atividade pública agregada, excluem o administrativo, respeitam GPC e têm retenção de 90 dias. Não contrate analytics ou assinatura externos.
- Preserve alterações locais alheias à tarefa. O checkout original tem alterações anteriores ainda não publicadas.
- Conclua os testes, faça commit e envie as alterações desta tarefa para `origin/main`. Aguarde a Vercel e confira o domínio antes de afirmar que está online.

## Plataforma 1.0.0

- CRM, equipe, perfis, permissões, auditoria, notificações e PWA integram o mesmo administrativo. Preserve a autorização por módulo no frontend, nas Edge Functions e no banco; exceções individuais prevalecem sobre o grupo. Nunca remova a proteção do último super administrador.
- A caixa é Titan adquirido pela GoDaddy. Um super administrador conecta em Comercial > E-mails > Conectar Titan, usando a senha da caixa. A Edge Function valida IMAP/SMTP e guarda a credencial criptografada no Vault; as RPCs de credenciais são exclusivas de `service_role`. `DUUK_MAIL_PASSWORD` continua como fallback legado, sem prioridade sobre o Vault. Não confunda a credencial da caixa com a senha de login do painel.
- `src/admin/releases.json` é a fonte interna de versões. O usuário pediu remover o histórico de versões e as janelas de novidades da interface. Mantenha apenas a atualização explícita da PWA, com proteção dos formulários pendentes e sem guardar dados privados em Cache Storage. Não publique notificações de histórico de versões.
- O e-mail oferece formatação básica, Cc/Cco, anexos de até 5 MB no total (máximo 5 arquivos), resposta/encaminhamento e pastas Entrada/Enviados. Preserve a sanitização de HTML, o isolamento da leitura e a separação entre os bytes SMTP sem Bcc e a cópia privada em Enviados. Uma falha ao salvar a cópia não deve repetir um envio SMTP já confirmado.
- A conexão IMAP usa TLS nativo do Deno com certificado validado e ImapFlow 2.2.6 fixado. Preserve o isolamento da fábrica de sockets e execute o fixture TLS antes de atualizar a biblioteca. Erros de transporte não devem ser apresentados como senha incorreta.
- Notificações são ativadas separadamente em cada aparelho. Confirme permissão, subscription local e cadastro remoto do endpoint antes de mostrar conexão ativa. O teste deve enviar somente ao dispositivo selecionado da conta autenticada; nunca dispare testes para outros usuários. No iPhone, a permissão precisa ser solicitada diretamente no toque dentro da PWA instalada.
- Consulte `docs/duuk-admin-operation.md` para operação, limites, configurações externas e validação.

## Google Calendar e notificações — 1.3.0

- A integração é exclusivamente DUUK → Google, por conta individual, usando um calendário criado pelo aplicativo e o escopo `calendar.app.created`. Nunca importe compromissos pessoais nem implemente sincronização inversa. Tokens ficam no Vault e as RPCs de integração são exclusivas do servidor; as tabelas sem policies abertas são intencionais.
- Google Cloud `duuk-511001` está configurado, com OAuth externo em produção, cliente Web DUUK Agenda e somente os escopos não confidenciais `openid`, `userinfo.email` (equivalente ao pedido `email`) e `calendar.app.created`. As duas credenciais estão nos Secrets das Edge Functions. A conta `filmzerick@gmail.com` concluiu OAuth real e teve um compromisso sincronizado sem erros em 7 de outubro de 2026. Múltiplas contas e CRUD externo completo ainda não foram validados em contas reais; cada membro deve consentir na própria conta. A marca Google ainda não foi verificada e o consentimento pode mostrar o domínio duukfilms.com. Consulte `docs/google-calendar-setup.md`. A fila conserva alterações durante bloqueios de permissão, mas o worker confere autorização antes de cada envio.
- Notificações correspondem às ações reais existentes e respeitam permissões e preferências. O portfólio ainda não possui responsável, prazo de produção ou conclusão; não fabrique alertas desses campos. Preserve a remoção do histórico de versões e as atualizações explícitas da PWA.
- O painel usa Realtime Presence privado no tópico `duuk:team:presence` para indicar membros ativos conectados. Conte uma pessoa uma única vez entre abas e aparelhos. Presença é apenas informativa e nunca substitui autorização; navegadores fechados ou suspensos pelo sistema aparecem offline quando a conexão cai.

## WhatsApp comercial — 1.4.0

- Use exclusivamente links oficiais `wa.me`, sem APIs pagas, sessões do WhatsApp ou envio automático. Abrir um link nunca confirma envio, leitura ou contato realizado. O registro é explícito e manual.
- Modelos compartilhados usam a permissão `crm.activities` para edição. Registre contato, mudança opcional de etapa e próximo follow-up na RPC transacional `duuk_record_contact`, com revisão e identificador estável. Verifique as permissões de cada módulo adicional no servidor.
- Os lembretes comerciais usam o agendador e a deduplicação existentes, com resumo diário às 9h de Brasília, aviso de amanhã, proposta sem retorno por três dias e negociação sem atualização por sete. Não dispare testes de push para aparelhos reais sem solicitação.

## Google Drive — 1.5.1

- A integração Google Drive é exclusiva do DUUK Admin, usa uma conta central (`duukfilms@gmail.com`) conectada por um super administrador e o escopo mínimo `drive.file`. Use um cliente OAuth Web separado do Google Calendar, com os segredos `DUUK_DRIVE_GOOGLE_CLIENT_ID` e `DUUK_DRIVE_GOOGLE_CLIENT_SECRET`, para separar as credenciais. Desconectar remove os tokens apenas da DUUK: não revogue automaticamente no Google, pois a revogação atinge todos os clientes OAuth do mesmo projeto e pode invalidar Calendar. Tokens ficam criptografados no Vault e as RPCs são exclusivas de `service_role`. Nunca exponha tokens ao navegador, nunca crie links públicos e nunca peça a senha do Google.
- Backend instalado em 8 de outubro de 2026: migração `supabase/google-drive.sql` aplicada, função `duuk-drive` versão 4 ativa e Cron a cada minuto. Google Drive API, escopo `drive.file`, cliente Web DUUK Drive e dois segredos `DUUK_DRIVE_GOOGLE_*` estão configurados no projeto `duuk-511001`; nenhum segredo foi salvo no repositório. A API autenticada confirma configuração. A conta central está autorizada e o original pendente foi enviado de verdade, com HTTP 200 e zero falhas. Instale também `google-drive-queue-fix.sql`, `google-drive-library.sql` e `google-drive-safeupdate.sql`, nessa ordem. Nunca remova filtros `WHERE` das atualizações da conexão: o PostgREST carrega `safeupdate`. A biblioteca `/admin/drive` exige a permissão `drive`, aceita arquivos até 20 MB e preserva as permissões de Contratos/CRM.
- A fila (`duuk_drive_documents`) nunca interrompe a assinatura eletrônica, não duplica arquivos, não sobrescreve o PDF assinado e não exclui definitivamente nada no Drive. A organização 1.6.0 permite lixeira reversível, preservando originais. Preserve esses invariantes ao alterar o fluxo de contratos.

## Organização do Google Drive — 1.6.0

- Mantenha `google-drive-folders.sql` depois das migrações anteriores. A RPC `duuk_drive_manage_backend` é exclusiva de service_role e compartilha o lease da sincronização. Use o diário de operações com identificador estável nas novas tentativas; não recrie operações ambíguas.
- Organizar pastas/arquivos usa metadados da API oficial e lixeira reversível, sem DELETE definitivo, compartilhamento público ou alteração de bytes. A pasta DUUK não pode ser movida ou enviada à lixeira. Permissões de origem das pastas permanecem ao mover; mutações em uma árvore exigem acesso ao conteúdo inteiro.
- Pastas/arquivos na lixeira têm tombstones: o worker não pode recriá-los. Restaurar uma pasta não restaura descendentes enviados individualmente à lixeira. Originais e evidências do Supabase nunca são excluídos pelo módulo Drive.
- O Google Drive é o último item do menu e utiliza a logo oficial local. Não amplie o escopo drive.file para listar arquivos pessoais da conta.

# Fluxo de trabalho da DUUK

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
- Backend instalado em 8 de outubro de 2026: migração `supabase/google-drive.sql` aplicada, função `duuk-drive` versão 3 ativa e Cron a cada minuto. Google Drive API, escopo `drive.file`, cliente Web DUUK Drive e dois segredos `DUUK_DRIVE_GOOGLE_*` estão configurados no projeto `duuk-511001`; nenhum segredo foi salvo no repositório. A API autenticada confirma configuração. A conta central está autorizada e o original pendente foi enviado de verdade, com HTTP 200 e zero falhas. Instale também `google-drive-queue-fix.sql`, `google-drive-library.sql` e `google-drive-safeupdate.sql`, nessa ordem. Nunca remova filtros `WHERE` das atualizações da conexão: o PostgREST carrega `safeupdate`. A biblioteca `/admin/drive` exige a permissão `drive`, aceita arquivos até 20 MB e preserva as permissões de Contratos/CRM.
- A fila (`duuk_drive_documents`) nunca interrompe a assinatura eletrônica, não duplica arquivos, não sobrescreve o PDF assinado e não apaga nada no Drive. Preserve esses invariantes ao alterar o fluxo de contratos.

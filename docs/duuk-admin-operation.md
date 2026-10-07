# Operação do DUUK Admin

## Acesso e autorização

O painel está em `https://www.duukfilms.com/admin`. O site institucional não contém links para ele. As contas individuais solicitadas foram criadas no Supabase Auth, sem senhas no repositório. A conta original continua ativa. Erick é super administrador; Douglas usa Administrador; Joao usa Comercial.

Em Configurações, o administrador pode gerenciar usuários, grupos e exceções individuais. Uma exceção de bloqueio prevalece sobre o grupo; super administradores mantêm acesso completo. O banco impede desativar ou rebaixar o último super administrador. Desativar uma conta bloqueia as operações no servidor imediatamente; a interface revalida o contexto ao focar e a cada minuto.

RLS protege os registros privados e as Edge Functions validam o usuário ativo e a permissão. As tabelas de configuração, subscriptions, fila e cursor são acessíveis exclusivamente pelo backend. O advisor informa ausência de policies nessas tabelas porque esse bloqueio é intencional. O aviso existente sobre proteção contra senhas vazadas depende do plano do Supabase; o projeto continua gratuito.

## Conteúdo e módulos

Salvar portfólio ou abertura publica o conteúdo numa única transação, com controle de revisão. Rascunhos e arquivados ficam privados. Uploads diretos continuam limitados a 50 MB por arquivo e ao espaço disponível do plano gratuito; vídeos maiores podem usar YouTube.

CRM usa clientes, atividades, follow-ups, histórico e etapas reais. Mudanças de pipeline e conclusões de follow-up verificam a revisão atual. No celular, o seletor de etapa complementa o arraste de cards. O sistema não contém leads de demonstração permanentes.

Contratos preservam PDFs privados, campos, links separados com validade de sete dias, aceite e desenho. Lixeira revoga links e permite restaurar. Exclusão definitiva exige ausência de assinaturas. Não há certificado ICP-Brasil nem verificação de identidade por e-mail.

Despesas exportam Excel/CSV conforme mês e filtro. A agenda usa horários de Brasília. Insights excluem administrativo e assinaturas; retenção de 90 dias e limpeza diária de chaves temporárias derivadas do IP permanecem ativas.

## Conectar a caixa GoDaddy

A arquitetura IMAP/SMTP está implementada, mas a credencial da caixa não foi fornecida. O painel mostra “Aguardando conexão” e bloqueia envio até a configuração real. A senha do administrativo não é utilizada como senha de e-mail.

Configure exclusivamente nos segredos das Edge Functions do projeto Supabase:

- `DUUK_MAIL_USERNAME`: `contato@duukfilms.com` (já é o padrão).
- `DUUK_MAIL_PASSWORD`: senha ou credencial específica da caixa GoDaddy Professional Email.

Hosts fixos: `imap.secureserver.net:993` e `smtpout.secureserver.net:465`, ambos TLS. A configuração corresponde ao produto Professional Email confirmado pelo MX; uma migração futura para Microsoft 365 exige adaptar o provedor.

Depois de configurar, valide a caixa de entrada e um envio individual para um destinatário autorizado. O job existente consulta mensagens novas a cada cinco minutos; a primeira consulta cria uma linha de base para não notificar todo o histórico antigo. A busca retorna até 50 mensagens recentes. Anexos do composer somam até 5 MB, no máximo cinco arquivos. Envios têm limite de dez por usuário/hora e identificador idempotente. Se o provedor não confirmar o envio, o painel pede conferir Enviados antes de tentar uma nova mensagem.

Credenciais, corpos de mensagens e conteúdo dos anexos não entram na auditoria. O banco guarda referências de mensagens e vínculos comerciais; leitura e envio usam o provedor real. Credenciais incorretas ou restrições da GoDaddy ainda precisam ser verificadas após conectar.

## Notificações e aplicativo

Configurações > Notificações permite ativar Web Push explicitamente no dispositivo e escolher categorias. Subscriptions pertencem ao usuário e podem incluir até dez dispositivos. Desativar ou sair remove somente o dispositivo atual. A entrega depende da permissão do navegador/sistema operacional e da conectividade do aparelho.

No iPhone/iPad compatível, instale pelo Safari > Compartilhar > Adicionar à Tela de Início, abra pelo ícone instalado e ative as notificações. A interface orienta dispositivos sem suporte. O recebimento em aparelho físico precisa ser validado no dispositivo do usuário.

VAPID privado e token do agendamento ficam criptografados no Supabase Vault. O cliente recebe somente a chave pública. O Cron dispara a função a cada cinco minutos. Preferências, permissões, deduplicação, tentativas limitadas e remoção de endpoints expirados são verificadas no backend.

Eventos reais incluem compromissos de amanhã/uma hora, follow-ups, assinatura recebida, resumo financeiro do mês encerrado, e-mails novos após conectar a GoDaddy e versões publicadas. Notificações internas ficam por 180 dias. A publicação de uma versão gera um único evento por usuário e versão.

## Publicar atualizações

1. Atualize `src/admin/releases.json`: primeira entrada é a versão atual, com data real, título e mudanças. Esse é o único local com a versão da aplicação.
2. Execute `npm test`, `npm run lint` e `npm run build` usando Node 22. O build gera identificador por conteúdo, shell, worker e metadados de versão.
3. Envie o commit para `origin/main`, aguarde Vercel e verifique `/admin`, `/admin-version.json`, manifest e site público.
4. Após confirmar o domínio atualizado, um super administrador pode chamar `duuk-notifications` autenticado com `{ "action": "publish-release", "version": "<versão>" }`. A operação é idempotente. Não publique o evento antes do frontend estar disponível.

O worker controla somente a área administrativa. Cache Storage contém shell genérico, JS/CSS/fontes e ícones; não armazena respostas de API, dados de CRM, PDFs ou assinaturas. Uma nova versão aguarda “Atualizar app”; formulários pendentes impedem a atualização. Somente a aba que solicitou a instalação recarrega. Caches necessários a outras abas abertas são preservados.

O aviso de novidades fecha imediatamente, sem depender da gravação na API. Um marcador de versão por usuário na sessão evita reabertura caso falte conexão; a gravação é tentada novamente ao reconectar. Os upserts de novidades vistas e preferências incluem a chave `user_id`: o privilégio de atualização dessa coluna é necessário ao PostgREST, e as policies `USING`/`WITH CHECK` continuam impedindo acesso ou transferência para outro usuário. `supabase/tests/notification-settings.sql` verifica os dois upserts e essas restrições numa transação com rollback.

Sem internet, o aplicativo abre o shell e informa a desconexão. Não grava alterações offline. No primeiro carregamento sem conexão, solicita reconexão para validar o acesso, sem persistir perfis ou dados privados em cache.

## Validação

Testes automatizados cobrem conteúdo, mídia, calendário, despesas/Excel e métricas comerciais. A integração real verifica autenticação, RLS, revisões antigas e funções exclusivas do servidor. A validação com registros temporários cobriu CRM, histórico, pipeline, follow-ups, exceções individuais, avatar privado e contas desativadas; os registros de teste foram removidos.

Navegador: 23 rotas, larguras 320/375/390/430/768/1024/1440, drawer, formulários, permissões e cache. A atualização da PWA é exercitada localmente entre dois builds, incluindo formulário pendente, outra aba aberta e recuperação offline. Nenhum documento real é assinado ou alterado nesses testes.

Limitações externas: a caixa GoDaddy aguarda sua credencial; entrega Web Push em aparelho físico exige ativação e teste no aparelho. Nenhum plano pago, provedor bancário ou integração de cobrança foi contratado.

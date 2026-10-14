# Social Media (Instagram) — instalação e operação

Módulo do DUUK Admin 2.0 em `/admin/social`. Usa somente a API oficial do Instagram com login do Instagram (`graph.instagram.com`, versão `v23.0`). Não usa scraping, sessão, cookie ou senha do Instagram.

## O que está instalado (14/10/2026)

| Parte | Estado |
| --- | --- |
| Migração `20261014151930_duuk_social` (tabelas, RLS, bucket privado `duuk-social`, chave de permissão `social`) | aplicada e registrada |
| Migração `20261014203900_duuk_social_functions` (RPCs, auditoria, Cron) | aplicada e registrada (SQL colado pelo Gustavo no SQL Editor; o registro em `schema_migrations` foi feito depois) |
| Edge Function `duuk-social` | versão 1 ativa, `verify_jwt=false` com autenticação própria |
| Cron `duuk-social-dispatch` | a cada minuto, só chama a função quando existe publicação vencida |
| Cron `duuk-social-daily` | 09:10 UTC, só chama a função quando existe conta ativa |
| Teste SQL `supabase/tests/social.sql` | aprovado com rollback |

Conferido no projeto em 14/10/2026 via `pg_net`: chamada com a chave interna do Cron → 202, chamada sem login → 401, `/duuk-social/deletion?code=inválido` → 400.

A permissão `social` não foi concedida a nenhum grupo. Superadministradores têm acesso; outros membros precisam recebê-la em Configurações › Grupos ou Permissões.

## Configuração no Meta (feita pelo Gustavo)

No app em developers.facebook.com:

1. Adicionar produto **Instagram** e escolher **API com login do Instagram**.
2. Em **Configurar login comercial do Instagram**, cadastrar:
   - URI de redirecionamento OAuth: `https://www.duukfilms.com/admin/social/conexao`
   - Cancelar autorização: `https://ilohuxhyfqikjlvoarts.supabase.co/functions/v1/duuk-social/deauthorize`
   - Exclusão de dados: `https://ilohuxhyfqikjlvoarts.supabase.co/functions/v1/duuk-social/data-deletion`
3. Em **Funções do app**, adicionar a conta profissional da DUUK como **Testador do Instagram** e aceitar o convite no Instagram (Configurações › Apps e sites › Convites de testador).
4. No DUUK Admin, em **Social Media › Conexão**, um superadministrador informa o **ID do app do Instagram** e a **chave secreta do app do Instagram**. A chave vai direto para o Vault; nunca passa pelo chat, pelo repositório ou pelos logs, e a tela não a exibe depois de salva.
5. Em **Conectar conta**, autorizar as três permissões abaixo.

O login só termina em `https://www.duukfilms.com`, porque a Meta exige o redirecionamento cadastrado. Prévias da Vercel e `localhost` mostram as telas, mas não concluem a conexão.

### Permissões pedidas

- `instagram_business_basic`: perfil, mídias e renovação do token.
- `instagram_business_content_publish`: publicar.
- `instagram_business_manage_insights`: métricas.

Comentários e mensagens não são pedidos.

### Níveis de acesso

- **Modo de desenvolvimento com Standard Access**: funciona para contas com função no app (testadores) e contas administradas pela DUUK. É o necessário para a conta da própria DUUK.
- **Advanced Access, App Review e verificação da empresa**: necessários para conectar contas de clientes. A tela de Conexão só oferece o vínculo com clientes quando o nível informado é Advanced Access.
- Enviar o app para análise, mudar pessoas ou funções no Meta e publicar conteúdo real dependem da aprovação explícita do Gustavo.

## Como funciona

- **Tokens.** O código do login vira um token de longa duração (60 dias), guardado no Vault. O servidor renova o token no job diário antes do vencimento. Desconectar remove o token da DUUK, e publicações agendadas daquela conta voltam para rascunho.
- **Mídia.** Arquivos ficam no bucket privado `duuk-social` do Storage existente, com limite de 50 MB por arquivo (plano gratuito). A Meta busca o arquivo por um link assinado temporário. Fotos são convertidas para JPEG no navegador.
- **Publicação.** Contêiner → verificação de status → `media_publish`, sempre no servidor. Cada publicação tem bloqueio próprio. Antes de qualquer nova tentativa, o servidor confere se a anterior já foi publicada, o que evita duplicar posts. Também consulta o limite diário da API e espera mais a cada nova tentativa. O resultado gera notificação e registro em auditoria.
- **Agendamento.** O Cron publica no horário mesmo com o painel fechado. Nada é publicado sem uma ação explícita: Publicar agora ou Agendar.
- **Métricas.** Somente o que a API retorna. Valores que a Meta não informa aparecem como "Indisponível" ou "—", nunca como zero. Seguidores vêm de um registro diário feito pelo servidor.
- **Exclusão de dados.** O endereço de exclusão apaga os dados da conta no DUUK e devolve um código de acompanhamento consultável em `/duuk-social/deletion?code=…`.

## Validação

- `node --test tests/social.test.mjs` (regras de formato, legenda, agendamento e worker).
- `supabase/tests/social.sql` dentro de transação com rollback.
- Telas: `node tests/e2e/screens.mjs --routes /admin/social,/admin/social/publicar,/admin/social/calendario,/admin/social/biblioteca,/admin/social/insights,/admin/social/conexao --widths 390,820,1440 --themes dark,light`. Usa dados isolados de `tests/e2e/fixtures.mjs`; o mock recusa conexão e publicação.
- Não faça publicação real de teste sem autorização do Gustavo.

## Reversão

`supabase/rollbacks/20261014151930_duuk_social_down.sql` remove somente o que as duas migrações criaram. Use-o apenas depois de voltar o Admin para uma versão sem Social Media. Antes, esvazie o bucket `duuk-social` pela API do Storage ou pelo painel.

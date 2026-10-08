# Google Drive da DUUK — 1.4.0

Integração oficial OAuth 2.0 + Google Drive API v3, usada somente pelo DUUK Admin. O site institucional não é afetado. A conta central esperada é `duukfilms@gmail.com`; um super administrador a conecta uma única vez em **Configurações → Integrações → Google Drive**. Membros comuns não conectam nada.

**Estado em 8 de outubro de 2026: implementado e testado com Google simulado, mas ainda não validado com uma conta Google real.** Nenhum teste real foi feito porque a migração, a Edge Function e as configurações abaixo ainda precisam ser aplicadas no Supabase/Google Cloud, e a conexão exige consentimento do titular da conta. Não afirme que a integração está funcionando antes de concluir o roteiro de validação no fim deste guia.

## O que é guardado e como

```text
DUUK/
  Contratos/<Cliente>/Contratos Gerados/Contrato <Cliente>.pdf
  Contratos/<Cliente>/Contratos Assinados/Contrato <Cliente> - Assinado.pdf
  Propostas Comerciais/<Cliente>/Proposta Comercial <Cliente>.pdf
  Documentos/<Cliente>/
```

- Contrato criado ou PDF enviado: o PDF original entra na fila e vai para **Contratos Gerados**. Só PDFs que já existem no DUUK Admin são enviados; a assinatura eletrônica não muda.
- Contrato com todas as assinaturas obrigatórias: o PDF final entra na fila e vai para **Contratos Assinados**. Contratos com assinaturas pendentes nunca são tratados como finalizados, e um PDF final nunca sobrescreve outro.
- Propostas: enviadas no cadastro do cliente (Comercial → Clientes e leads → cliente → Propostas). Exigem a permissão `crm.clients`.
- O cliente é identificado por `crm:<id>` (CRM, quando e-mail/nome/empresa casam com um único cadastro) ou por um hash estável de nome+e-mail. Clientes homônimos não compartilham pasta. Nomes repetidos recebem sufixo `(2)`, `(3)`.
- Os IDs das pastas ficam em `duuk_drive_folders`; pastas e arquivos recebem `appProperties` próprias, então tentativas repetidas adotam o que já existe em vez de duplicar.
- Nada é apagado no Drive: excluir contrato preserva as referências dos documentos já enviados e só remove pendências que nunca chegaram ao Google.
- Nenhum link público ou permissão compartilhada é criado. Visualizar/baixar passa pelo backend autenticado, que entrega o PDF a partir do armazenamento privado do Supabase; "Abrir no Drive" só aparece para quem tem permissão e só aponta para `drive.google.com`.

## Fila e tentativas

`duuk_drive_documents` registra origem, hash, estado (`pending`, `synced`, `error`), tentativas e erro curto em português. O Cron `duuk-drive-sync` chama a Edge Function `duuk-drive` a cada minuto; o worker usa lease único, lotes e limite de tempo, sem processos em memória. Falhas temporárias recebem até oito tentativas com espera crescente (até 6 h); erros permanentes (arquivo inválido, hash divergente) ficam em **Erro de sincronização** até **Sincronizar novamente**. Falhas no Drive nunca interrompem ou desfazem a assinatura: a fila é gravada na mesma transação, mas qualquer exceção do enfileiramento é registrada e ignorada.

## Notificações

Respeitam permissões e preferências, com deduplicação: contrato finalizado salvo (permissão Contratos); falha após três tentativas e recuperação posterior (Contratos); proposta salva (Comercial); Drive desconectado, autorização expirada ou espaço ≥ 90 % (administração). Textos sem detalhes técnicos.

## Configurar o Google Cloud (projeto `duuk-511001`)

1. Em **APIs e serviços → Biblioteca**, ative **Google Drive API**. Mantenha o faturamento desativado; o uso fica nas cotas gratuitas.
2. Em **Google Auth Platform → Data Access**, adicione o escopo `https://www.googleapis.com/auth/drive.file` (além de `openid` e `email` já existentes). `drive.file` só dá acesso a arquivos criados pelo próprio aplicativo; não adicione `drive`, `drive.readonly` nem outros.
3. Reutilize o cliente Web **DUUK Agenda** e o redirect URI já cadastrado, `https://www.duukfilms.com/admin/configuracoes/integracoes`. O estado OAuth do Drive usa o prefixo `drv.` para a tela distinguir o retorno do Calendar.
4. Se o consentimento já estiver em produção, não é preciso mais nada. `drive.file` é um escopo não sensível. Em modo Testing, inclua `duukfilms@gmail.com` como usuário de teste (autorização offline expira em 7 dias nesse modo).

## Configurar o Supabase

1. Aplique `supabase/google-drive.sql` uma única vez, no SQL Editor (como as demais migrações, não é reexecutável). Ele cria tabelas, RLS, funções, triggers, o backfill dos contratos existentes e o Cron. Contratos já existentes entram na fila; a migração não chama o Google.
2. Faça o deploy da Edge Function `duuk-drive` (`supabase/functions/duuk-drive`), com a mesma configuração das demais (a função valida usuários e o segredo Cron; não ative a verificação JWT legada do gateway).
3. Segredos já existentes e reutilizados: `DUUK_GOOGLE_CLIENT_ID` e `DUUK_GOOGLE_CLIENT_SECRET`. Opcional: `DUUK_DRIVE_ACCOUNT_EMAIL` para trocar a conta esperada (padrão `duukfilms@gmail.com`).
4. Nenhuma variável nova na Vercel. Nada de credencial no navegador ou no repositório.
5. Um super administrador abre **Configurações → Integrações → Google Drive**, toca em **Conectar Google Drive** e entra com `duukfilms@gmail.com`. O backend só aceita o retorno se o e-mail verificado for o esperado, o escopo concedido incluir `drive.file` e houver refresh token; caso contrário, revoga a autorização. O refresh token fica criptografado no Vault; as RPCs são exclusivas de `service_role`. Ao reconectar, a credencial anterior é retirada do Vault e sua revogação no Google é tentada sem expô-la ao navegador.

Enquanto a migração ou a função não estiverem no ar, as telas ocultam os indicadores nas listas e mostram uma mensagem discreta nos painéis; contratos e assinaturas funcionam normalmente.

## Validação

- `supabase/tests/google-drive.sql` (com rollback): fila transacional, nomes, homônimos, nomes inseguros, assinatura parcial, render obsoleto, isolamento de falhas, OAuth restrito a super admin e consumo único do state, Vault, lease único, pastas sem duplicação, idempotência e proteção do assinado, notificações, permissões, propostas, exclusão de contratos e privilégios de coluna do navegador.
- `tests/google-drive.test.mjs`: protocolo com Drive simulado (pastas, multipart, adoção de arquivo existente, repetição sem duplicar, renovação de token, erros sem segredos, cota).
- `deno check` das Edge Functions, `npm run lint`, `npm run build` e `npm test`.
- UI com sessão e APIs simuladas em 320, 390, 768 e 1440 px: cartão em Integrações, indicadores na lista de contratos, painel no contrato e propostas no cliente, sem overflow horizontal.

### Roteiro com a conta real (pendente)

1. Conecte `duukfilms@gmail.com` e confirme conta, status e espaço.
2. Crie um contrato de teste, confira `DUUK/Contratos/<Cliente>/Contratos Gerados` no Drive e o indicador **Sincronizado**.
3. Gere os links, assine como cliente e DUUK e confira o PDF em **Contratos Assinados**.
4. Use **Sincronizar novamente** e confirme que não há arquivo duplicado.
5. Envie uma proposta no cliente e confira `Propostas Comerciais`.
6. Revogue o acesso em myaccount.google.com, confirme **Reconexão necessária** e a notificação, reconecte e confira que as pendências sobem sozinhas.
7. Remova apenas os registros de teste.

Referências: [escopos do Drive](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [OAuth para aplicações web](https://developers.google.com/identity/protocols/oauth2/web-server), [upload de arquivos](https://developers.google.com/workspace/drive/api/guides/manage-uploads).

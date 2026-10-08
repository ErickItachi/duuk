# Google Drive da DUUK — 1.5.0

Integração oficial OAuth 2.0 + Google Drive API v3, usada somente pelo DUUK Admin. O site institucional não é afetado. A conta central esperada é `duukfilms@gmail.com`; um super administrador a conecta uma única vez em **Configurações → Integrações → Google Drive**. Membros comuns não conectam nada.

**Estado em 8 de outubro de 2026: backend instalado e configuração do Google Cloud concluída.** A migração está aplicada, a função `duuk-drive` está ativa, o Cron roda a cada minuto e os dois segredos dedicados estão configurados. Google Drive API foi ativada no projeto `duuk-511001`, com cliente Web **DUUK Drive**, redirect autorizado e escopo não confidencial `drive.file`, preservando os escopos anteriores do Calendar. A API autenticada retornou `configured: true`, conta esperada `duukfilms@gmail.com` e um PDF original pendente. O consentimento da conta central e os uploads reais ainda serão validados; testes simulados não comprovam essa etapa.

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
- Propostas e documentos: enviados no cadastro do cliente (Comercial → Clientes e leads → cliente → Propostas ou Documentos). Exigem a permissão `crm.clients`.
- O cliente é identificado por `crm:<id>` (CRM, quando e-mail/nome/empresa casam com um único cadastro) ou por um hash estável de nome+e-mail. Quando existe e-mail informado sem correspondência única no CRM, a chave externa usa nome e e-mail, sem presumir identidade pelo nome. Clientes homônimos não compartilham pasta. Nomes repetidos recebem sufixo `(2)`, `(3)`.
- Os IDs das pastas ficam em `duuk_drive_folders`; pastas e arquivos recebem `appProperties` próprias, então tentativas repetidas adotam o que já existe em vez de duplicar.
- Nada é apagado no Drive: excluir contrato preserva as referências dos documentos já enviados e só remove pendências que nunca chegaram ao Google.
- Nenhum link público ou permissão compartilhada é criado. Visualizar/baixar passa pelo backend autenticado, que entrega o PDF a partir do armazenamento privado do Supabase; "Abrir no Drive" só aparece para quem tem permissão e só aponta para `drive.google.com`.

## Fila e tentativas

`duuk_drive_documents` registra origem, hash, estado (`pending`, `synced`, `error`), tentativas e erro curto em português. O Cron `duuk-drive-sync` chama a Edge Function `duuk-drive` a cada minuto; o worker usa lease único, lotes e limite de tempo, sem processos em memória. Falhas temporárias recebem até oito tentativas com espera crescente (até 6 h); erros permanentes (arquivo inválido, hash divergente) ficam em **Erro de sincronização** até **Sincronizar novamente**. Falhas no Drive nunca interrompem ou desfazem a assinatura: a fila é gravada na mesma transação, mas qualquer exceção do enfileiramento é registrada e ignorada. Uma reconciliação limitada recupera pendências ausentes nas próximas execuções. Cada transferência verifica a conexão e o hash de origem antes de escrever, e a confirmação rejeita fontes alteradas.

## Notificações

Respeitam permissões e preferências, com deduplicação: contrato finalizado salvo (permissão Contratos); falha após três tentativas e recuperação posterior (Contratos); proposta salva (Comercial); Drive desconectado, autorização expirada ou espaço ≥ 90 % (administração). Textos sem detalhes técnicos.

## Configurar o Google Cloud (projeto `duuk-511001`)

1. Em **APIs e serviços → Biblioteca**, ative **Google Drive API**. Mantenha o faturamento desativado; o uso fica nas cotas gratuitas.
2. Em **Google Auth Platform → Data Access**, adicione o escopo `https://www.googleapis.com/auth/drive.file` (além de `openid` e `email` já existentes). `drive.file` só dá acesso a arquivos criados pelo próprio aplicativo; não adicione `drive`, `drive.readonly` nem outros.
3. Crie outro cliente OAuth do tipo **Web application**, com o nome **DUUK Drive**, e cadastre o redirect URI `https://www.duukfilms.com/admin/configuracoes/integracoes`. Não reutilize o cliente **DUUK Agenda**: mantenha credenciais e callbacks separados. Clientes do mesmo projeto ainda compartilham os efeitos de uma revogação no Google; a DUUK desconecta localmente para preservar o Calendar. O estado OAuth do Drive usa o prefixo `drv.` para a tela distinguir os dois retornos.
4. Se o consentimento já estiver em produção, não é preciso mudar a audiência. `drive.file` é um escopo não sensível. Em modo Testing, inclua `duukfilms@gmail.com` como usuário de teste (a autorização offline expira em 7 dias nesse modo).

## Configurar o Supabase

1. Aplique `supabase/google-drive.sql` uma única vez, no SQL Editor (como as demais migrações, não é reexecutável). Ele cria tabelas, RLS, funções, triggers, o backfill dos contratos existentes e o Cron. Contratos já existentes entram na fila; a migração não chama o Google.
2. Faça o deploy da Edge Function `duuk-drive` (`supabase/functions/duuk-drive`), com a mesma configuração das demais (a função valida usuários e o segredo Cron; não ative a verificação JWT legada do gateway).
3. Cadastre `DUUK_DRIVE_GOOGLE_CLIENT_ID` e `DUUK_DRIVE_GOOGLE_CLIENT_SECRET` com as credenciais do cliente Web **DUUK Drive**. Não copie as credenciais `DUUK_GOOGLE_*` do Calendar. Opcional: `DUUK_DRIVE_ACCOUNT_EMAIL` para trocar a conta esperada (padrão `duukfilms@gmail.com`).
4. Nenhuma variável nova na Vercel. Nada de credencial no navegador ou no repositório.
5. Um super administrador abre **Configurações → Integrações → Google Drive**, toca em **Conectar Google Drive** e entra com `duukfilms@gmail.com`. O backend só aceita o retorno se o e-mail verificado for o esperado, o escopo concedido incluir `drive.file` e houver refresh token; caso contrário, rejeita o retorno sem substituir a conexão existente nem revogar permissões de outras integrações. O refresh token fica criptografado no Vault; as RPCs são exclusivas de `service_role`. Ao reconectar, a credencial anterior é substituída no Vault. Desconectar remove os tokens da DUUK e interrompe a fila, preservando os arquivos. Não há revogação automática no Google: ela invalida as autorizações de todos os clientes OAuth do mesmo projeto, incluindo o Calendar. Para revogar no Google, o titular pode usar a área de segurança da conta, ciente desse efeito, ou a administração pode configurar um projeto Google Cloud exclusivo para Drive.

Se a migração ou a função ficarem indisponíveis, as telas ocultam os indicadores nas listas e mostram uma mensagem discreta nos painéis; contratos e assinaturas funcionam normalmente.

## Validação

- `supabase/tests/google-drive.sql` (com rollback): fila transacional, nomes, homônimos, nomes inseguros, assinatura parcial, render obsoleto, isolamento de falhas, OAuth restrito a super admin e consumo único do state, Vault, lease único, pastas sem duplicação, idempotência e proteção do assinado, notificações sem cliente, separação dos caminhos de contratos/propostas no Storage, permissões, exclusão de contratos e privilégios de coluna do navegador.
- `tests/google-drive.test.mjs`: protocolo com Drive simulado (pastas, multipart até 5 MB, upload resumível acima de 5 MB, adoção de arquivo existente, repetição sem duplicar, renovação de token, erros sem segredos, cota).
- `deno check` das Edge Functions, `npm run lint`, `npm run build` e `npm test`.
- UI com sessão e APIs simuladas em 320, 390, 768 e 1440 px: cartão em Integrações, indicadores na lista de contratos, painel no contrato e propostas no cliente, sem overflow horizontal.

### Roteiro com a conta real

1. Em Configurações → Integrações → Google Drive, conecte `duukfilms@gmail.com` e confirme conta, status e espaço.
2. Crie um contrato de teste, confira `DUUK/Contratos/<Cliente>/Contratos Gerados` no Drive e o indicador **Sincronizado**.
3. Gere os links, assine como cliente e DUUK e confira o PDF em **Contratos Assinados**.
4. Use **Sincronizar novamente** e confirme que não há arquivo duplicado.
5. Envie uma proposta no cliente e confira `Propostas Comerciais`.
6. Para testar falhas sem afetar as agendas, use os testes isolados. Revogar em myaccount.google.com remove o grant do projeto inteiro, incluindo Calendar; não faça isso com autorizações reais apenas para validar o Drive.
7. Remova apenas os registros de teste.

Referências: [escopos do Drive](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [OAuth para aplicações web](https://developers.google.com/identity/protocols/oauth2/web-server), [upload de arquivos](https://developers.google.com/workspace/drive/api/guides/manage-uploads).

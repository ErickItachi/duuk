# Google Drive da DUUK — 1.6.0

Integração oficial OAuth 2.0 + Google Drive API v3, usada somente pelo DUUK Admin. O site institucional não é afetado. A conta central esperada é `duukfilms@gmail.com`; um super administrador a conecta uma única vez em **Configurações → Integrações → Google Drive**. Membros comuns não conectam nada.

**Estado em 8 de outubro de 2026: conta central conectada e envio real validado.** A migração inicial, as correções incrementais de fila/biblioteca e a migração de pastas, com a função `duuk-drive` v4 estão instaladas. O Cron roda a cada minuto. Google Drive API, cliente Web **DUUK Drive**, redirect, escopo `drive.file` e segredos dedicados estão configurados no projeto `duuk-511001`, preservando o Calendar. A conta `duukfilms@gmail.com` concluiu OAuth. O contrato original que estava pendente foi enviado de verdade: a API retornou HTTP 200, um documento processado, zero falhas, ID do Google registrado e estado `synced`. O Google informou cota de 15 GB. Nenhuma configuração adicional do Google Cloud é necessária para esse fluxo. A transferência de um contrato final após duas assinaturas foi validada em testes de banco/protocolo, sem criar assinaturas ou contratos reais apenas para o teste.

## O que é guardado e como

```text
DUUK/
  Contratos/<Cliente>/Contratos Gerados/Contrato <Cliente>.pdf
  Contratos/<Cliente>/Contratos Assinados/Contrato <Cliente> - Assinado.pdf
  Propostas Comerciais/<Cliente>/Proposta Comercial <Cliente>.pdf
  Documentos/<Cliente>/
  Documentos/Internos/<Arquivo>
```

- Contrato criado ou PDF enviado: o PDF original entra na fila e vai para **Contratos Gerados**. Só PDFs que já existem no DUUK Admin são enviados; a assinatura eletrônica não muda.
- Contrato com todas as assinaturas obrigatórias: o PDF final entra na fila e vai para **Contratos Assinados**. Contratos com assinaturas pendentes nunca são tratados como finalizados, e um PDF final nunca sobrescreve outro.
- Propostas e documentos: enviados no cadastro do cliente (Comercial → Clientes e leads → cliente → Propostas ou Documentos). Exigem a permissão `crm.clients`.
- O cliente é identificado por `crm:<id>` (CRM, quando e-mail/nome/empresa casam com um único cadastro) ou por um hash estável de nome+e-mail. Quando existe e-mail informado sem correspondência única no CRM, a chave externa usa nome e e-mail, sem presumir identidade pelo nome. Clientes homônimos não compartilham pasta. Nomes repetidos recebem sufixo `(2)`, `(3)`.
- Os IDs das pastas ficam em `duuk_drive_folders`; pastas e arquivos recebem `appProperties` próprias, então tentativas repetidas adotam o que já existe em vez de duplicar.
- Excluir um contrato no módulo Contratos preserva as referências dos documentos já enviados. A organização do Drive usa somente a lixeira reversível do Google; nunca exclui originais ou evidências do Supabase.
- Nenhum link público ou permissão compartilhada é criado. Visualizar/baixar passa pelo backend autenticado, que entrega o PDF a partir do armazenamento privado do Supabase; "Abrir no Drive" só aparece para quem tem permissão e só aponta para `drive.google.com`.

## Biblioteca de arquivos — 1.5.1

O menu **Google Drive** abre `/admin/drive`: busca por arquivo/cliente, categorias, paginação, estado da fila, nova tentativa, visualização e download autenticados. PDFs usam o visualizador canvas existente, com seletor de páginas; imagens e vídeos têm prévia; Office, ZIP e texto podem ser baixados para abrir no aplicativo correspondente. As logos Google são oficiais, guardadas localmente e sem alteração.

**Enviar arquivo** aceita PDF, JPG/PNG/WebP, DOCX/XLSX/PPTX, TXT/CSV, ZIP e MP4/MOV até 20 MB. Validação confere extensão, assinatura do formato, tamanho e hash; PDFs devem estar sem senha. Use a pasta **Internos** ou selecione um cliente com acesso ao CRM. Os arquivos ficam no bucket privado `duuk-drive-files`, sem policy pública e sem acesso direto do navegador, e seguem a fila existente para o Drive. Os limites gratuitos do Supabase e da conta Google continuam aplicáveis.

A permissão **Google Drive** pode ser atribuída aos grupos e membros. Ela permite arquivos gerais; contratos ainda exigem **Contratos**, e propostas/documentos de cliente exigem **Clientes e leads**. A biblioteca não mostra arquivos pessoais anteriores da conta Google: o escopo permanece `drive.file`.

## Organização por pastas — 1.6.0

O Drive é o último item do menu, com sua logo oficial. **Pastas** mostra a estrutura e o caminho navegável; **Todos os arquivos** reúne os documentos permitidos; **Lixeira** permite restaurar. É possível criar pastas, renomear, editar descrições, mover arquivos/pastas e enviar arquivos diretamente à pasta escolhida. A edição de documentos altera somente nome e descrição, preservando extensão, bytes, hashes e assinaturas. A pasta principal DUUK permanece disponível.

As ações passam pela RPC exclusiva do servidor `duuk_drive_manage_backend`, com permissões atuais, revisão, registro de auditoria e o mesmo lease da fila. Um diário privado guarda a operação antes da chamada ao Google. Uma tentativa interrompida pode ser concluída com o mesmo identificador; a criação busca seu marcador antes de enviar outro POST. IDs do Google são resolvidos pelo banco, e marcadores confirmam que o item pertence à DUUK antes do PATCH. Nenhuma ação cria compartilhamentos públicos ou exclui definitivamente arquivos.

Pastas com conteúdo de outros módulos exigem acesso a todo o conteúdo para organização. A origem da permissão acompanha a pasta mesmo ao movê-la. A lixeira é herdada pelos descendentes; restaurar uma pasta preserva arquivos que já estavam individualmente na lixeira. Pastas na lixeira não são recriadas pelo worker; restaure a pasta para retomar novos envios automáticos. Se o Google remover definitivamente um item da lixeira, ele deixa de estar disponível para restauração por este módulo.

Instale `supabase/google-drive-folders.sql` após as migrações anteriores e publique a função `duuk-drive` com `_shared/drive-manager.mjs`. A versão não requer novos escopos, consentimento, credenciais ou plano pago.

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

1. Aplique `supabase/google-drive.sql` e depois `google-drive-queue-fix.sql`, `google-drive-library.sql` e `google-drive-safeupdate.sql`, seguidos de `google-drive-folders.sql`, nessa ordem e uma única vez cada, no SQL Editor (como as demais migrações, não é reexecutável). Ele cria tabelas, RLS, funções, triggers, o backfill dos contratos existentes e o Cron. Contratos já existentes entram na fila; a migração não chama o Google.
2. Faça o deploy da Edge Function `duuk-drive` (`supabase/functions/duuk-drive`), com a mesma configuração das demais (a função valida usuários e o segredo Cron; não ative a verificação JWT legada do gateway).
3. Cadastre `DUUK_DRIVE_GOOGLE_CLIENT_ID` e `DUUK_DRIVE_GOOGLE_CLIENT_SECRET` com as credenciais do cliente Web **DUUK Drive**. Não copie as credenciais `DUUK_GOOGLE_*` do Calendar. Opcional: `DUUK_DRIVE_ACCOUNT_EMAIL` para trocar a conta esperada (padrão `duukfilms@gmail.com`).
4. Nenhuma variável nova na Vercel. Nada de credencial no navegador ou no repositório.
5. Um super administrador abre **Configurações → Integrações → Google Drive**, toca em **Conectar Google Drive** e entra com `duukfilms@gmail.com`. O backend só aceita o retorno se o e-mail verificado for o esperado, o escopo concedido incluir `drive.file` e houver refresh token; caso contrário, rejeita o retorno sem substituir a conexão existente nem revogar permissões de outras integrações. O refresh token fica criptografado no Vault; as RPCs são exclusivas de `service_role`. Ao reconectar, a credencial anterior é substituída no Vault. Desconectar remove os tokens da DUUK e interrompe a fila, preservando os arquivos. Não há revogação automática no Google: ela invalida as autorizações de todos os clientes OAuth do mesmo projeto, incluindo o Calendar. Para revogar no Google, o titular pode usar a área de segurança da conta, ciente desse efeito, ou a administração pode configurar um projeto Google Cloud exclusivo para Drive.

Se a migração ou a função ficarem indisponíveis, as telas ocultam os indicadores nas listas e mostram uma mensagem discreta nos painéis; contratos e assinaturas funcionam normalmente.

## Validação

- `supabase/tests/google-drive.sql` (com rollback): fila transacional, nomes, homônimos, nomes inseguros, assinatura parcial, render obsoleto, isolamento de falhas, OAuth restrito a super admin e consumo único do state, Vault, lease único, pastas sem duplicação, idempotência e proteção do assinado, notificações sem cliente, separação dos caminhos de contratos/propostas no Storage, permissões, exclusão de contratos e privilégios de coluna do navegador.
- `tests/google-drive.test.mjs`: protocolo com Drive simulado (pastas, multipart até 5 MB, upload resumível acima de 5 MB, adoção de arquivo existente, repetição sem duplicar, renovação de token, erros sem segredos, cota).
- As fixtures verificam consultas com `WHERE` para a proteção `safeupdate` do PostgREST. O provedor não permite `LOAD` dessa biblioteca pela ferramenta SQL; a validação da proteção real foi feita pelo dispatch HTTP com upload confirmado, sem desativar a proteção.
- `supabase/tests/google-drive-library.sql`: biblioteca, tipos, tamanho, paths por ator, notificações e permissões.
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

Validação 1.6.0: 71 testes Node passaram (um opt-in não executado); fixtures SQL com rollback validaram criação/replay, recuperação, ciclos, revisões, lixeira herdada, restauração seletiva e permissões. Type check e build passaram; lint manteve somente três avisos preexistentes. O navegador validou CRUD, upload para pasta, prévia/download privados, menu e formulários em 320–1440 px com APIs interceptadas. A atualização PWA 1.4.0 → 1.6.0 preservou formulário pendente, outra aba aberta e cache apenas de assets, sem chamadas de escrita.

Na conta central real, as chamadas autenticadas validaram criação/replay sem duplicação, nome/descrição, movimentação de pastas, upload TXT para pasta escolhida, rename/movimento de arquivo, download privado com bytes originais, lixeira e restauração de pasta preservando um arquivo individualmente na lixeira. A pasta temporária ficou na lixeira do Google após o teste. Nenhum contrato de cliente foi alterado.

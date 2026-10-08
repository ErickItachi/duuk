# Continuidade da integração Google Drive — 8 de outubro de 2026

A implementação veio da branch `origin/cursor/google-drive-integration-657e`, baseada em `f39ce94`. Foram preservados os cinco commits do Cursor/Claude: `27f56cf`, `87f0fbf`, `21b771b`, `30ae8a2` e `aff924d`. Eles criaram a tela de integração, OAuth, fila, pastas, contratos originais/finais, propostas, documentação e testes. A branch não estava em produção. O checkout publicado já continha o WhatsApp (`d569ff6`), incorporado junto com o Drive na resolução dos quatro conflitos de integração.

O checkout original `../duuk` mantém alterações locais antigas de mídia/configuração, que não fazem parte desta entrega. Nenhuma dessas alterações foi descartada ou publicada. O site institucional, suas páginas, mídias, configuração Vercel, dependências e mecanismo PWA não foram modificados nesta tarefa.

## Correções e conclusão

- Revogação automática removida: no Google ela atinge o grant de todo o projeto, mesmo com clientes OAuth diferentes, e podia invalidar a reconexão e o Calendar. Desconexão local elimina tokens do Vault e invalida a fila em andamento.
- Primeiro PDF com as duas assinaturas preservado como arquivo final. Transferências e confirmações verificam fonte, hash, conexão e lease; divergências não sobrescrevem documentos.
- Recuperação limitada de pendências ausentes após falha isolada de trigger. Falhas de Google nunca desfazem uma assinatura ou contrato.
- Identidade de cliente não é presumida pelo nome quando existe e-mail diferente. Nomes homônimos recebem pastas distintas.
- Documentos genéricos em PDF acrescentados ao cadastro do cliente, além das propostas, com título opcional, categoria e permissões próprias de CRM.
- Interface revisada para carregamento, erros, visualização/download privado, polling do PDF final, confirmação de desconexão e rodapé responsivo do cliente.
- Fixture SQL corrigida para testar a criptografia real do Vault, categorias, fontes obsoletas, RLS e notificações, com rollback obrigatório.
- Release 1.5.0: “Integração com Google Drive”, mantendo a atualização explícita e a proteção de formulários do aplicativo.

## Configuração aplicada

Supabase `ilohuxhyfqikjlvoarts`: migração `duuk_central_google_drive_documents`, função `duuk-drive` v1, Cron a cada minuto e segredos `DUUK_DRIVE_GOOGLE_CLIENT_ID` / `DUUK_DRIVE_GOOGLE_CLIENT_SECRET`. Credenciais não foram copiadas para arquivos ou logs.

Google Cloud `duuk-511001`: Drive API habilitada, cliente Web dedicado DUUK Drive, redirect `https://www.duukfilms.com/admin/configuracoes/integracoes` e escopo mínimo `drive.file`, preservando `openid`, e-mail e o Calendar. Não foi habilitada cobrança. O titular precisa autorizar a conta central `duukfilms@gmail.com` uma vez; membros não conectam suas contas.

## Evidências de validação

- 52 testes Node passaram, um teste opt-in anterior ignorado; 21 testes são específicos do Drive.
- Deno type check do backend passou. Lint mantém três avisos preexistentes, sem novos avisos nos componentes Drive. Build de produção passou.
- Migração e fixture SQL passaram juntas em uma transação com rollback e novamente após a instalação. Cobrem fila, originais, assinatura parcial/final, PDF obsoleto, falhas, retomada, concorrência, Vault, notificações e permissões. Não enviam arquivos ou push.
- API real autenticada: HTTP 200 e configuração pronta. Anônimos: status 401, dispatch 403; RPC de backend indisponível a anon/authenticated. Advisors não apontaram nova abertura de dados; as tabelas do servidor permanecem sem policies públicas intencionalmente.
- PWA em navegador isolado: build publicado 1.4.0 detectou 1.5.0, atualização aguardou confirmação, formulário pendente bloqueou reload, atualização explícita recarregou somente uma aba e nenhum dado de API foi guardado em cache.

A UI passou em 320–1440 px, com integração, OAuth, PDFs, permissões, erros e rodapé mobile.

A conexão real da conta central e transferências reais são descritas no estado atual de [google-drive-setup.md](google-drive-setup.md). Testes com Google simulado e fixture SQL não substituem o consentimento ou a validação de uma transferência externa. O relatório final da entrega deve informar separadamente qualquer etapa ainda pendente.

## Biblioteca e correção do envio — 1.5.1

A conta central foi autorizada. O envio real revelou duas diferenças não cobertas pelos testes SQL iniciais: o alias `c` da reconciliação colidia com a variável da conexão e o ambiente PostgREST carrega `safeupdate`, que rejeita alterações sem `WHERE`. As consultas foram corrigidas e a proteção do banco foi mantida. A regressão passou a chamar a reconciliação e a verificar os filtros das consultas. O provedor recusou `LOAD safeupdate` pela ferramenta SQL; por isso a proteção real foi validada separadamente por HTTP, com upload confirmado, sem desativá-la.

O novo módulo `/admin/drive` lista os documentos conforme suas permissões, com busca, categorias, prévia, download, reenvio e envio de arquivos internos ou associados a clientes. PDFs, imagens, Office, TXT, CSV, ZIP e vídeos MP4/MOV têm limite de 20 MB; propostas e documentos do CRM mantêm 10 MB. Os arquivos ficam em bucket privado separado e na fila existente. A permissão Google Drive pode ser atribuída aos grupos e membros; ela não concede acesso aos contratos ou ao CRM. O módulo mostra arquivos gerenciados pela DUUK, não os demais arquivos pessoais da conta. Google Calendar e Google Drive passaram a usar suas logos oficiais locais.

As migrações incrementais são `google-drive-queue-fix.sql`, `google-drive-library.sql` e `google-drive-safeupdate.sql`, nessa ordem, depois da migração inicial. Credenciais, autenticação dos membros e assinatura eletrônica permanecem no fluxo existente.

Validação final da 1.5.1: 56 testes Node passaram e um teste opt-in anterior permaneceu ignorado; lint mantém os três avisos anteriores, Deno check e build passaram. As duas fixtures SQL passaram com rollback, incluindo reconciliação e biblioteca. Navegador com cabeçalhos CSP reais verificou busca, filtros, paginação, upload, limites, falhas, preview canvas de PDF, imagens/vídeos, download privado, nova tentativa, permissões e logos, em 320/390/430/768/1024/1440 px, sem erro de página, bloqueio CSP ou rolagem lateral.

Conta real: OAuth autorizado para duukfilms@gmail.com; dispatch HTTP 200 processou o contrato original pendente, sem falhas. Um guia TXT de uso da biblioteca (650 bytes) foi enviado por multipart real e sincronizado. Listagem, resolução do download e download privado retornaram HTTP 200, com tipo, tamanho e conteúdo conferidos. Os originais, o guia e as pastas têm IDs registrados no banco. Os testes externos não criaram contratos, assinaturas ou propostas de clientes fictícios; a cópia final assinada e propostas foram validadas pelos testes transacionais/protocolo, sem apresentar essa etapa como transferência real. A fixture com `LOAD safeupdate` não pôde ser executada por restrição do provedor; o worker real validou o ambiente protegido.

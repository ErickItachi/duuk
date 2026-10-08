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

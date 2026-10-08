# DUUK AI — validação de 8 de outubro de 2026

## Resultados confirmados

- Suíte Node: **82 testes passaram**, zero falhas, um teste legado opt-in do Supabase ignorado. Os novos casos verificam prompt/manual, permissões, modelos permitidos, redaction de contexto e streaming SSE.
- SDK oficial Gemini 2.28.0: **três testes Deno passaram** em transporte HTTP local, com chave fictícia: paginação, streaming incremental, uso final, cancelamento e 429 sem retry/fallback.
- Migração e fixture no Supabase real: isolamento de conversas e uso, RLS com papel `authenticated`, conta desativada, compartilhamento explícito, somente autor edita, versões, conflito de revisão, replay, retries sem duplicar mensagens, leases, concorrência e quotas. Todos passaram com rollback completo dos registros de teste. A consulta autorizada de projetos também foi validada e corrigiu uma colisão de alias PL/pgSQL encontrada no teste autenticado.
- API publicada `duuk-ai`, autenticada com sessão existente: status, limites, lista de conversas, documentos e projetos retornaram 200. Anônimo recebeu 401, chamada direta à RPC de credenciais recebeu 403, falta de aceite recebeu 400 e tentativa de geração sem credencial recebeu 503. Nenhuma chamada de geração foi enviada ao Google.
- Leituras autenticadas de contratos, agenda e despesas continuaram retornando 200; o contexto do membro continuou ativo. Nenhum contrato foi alterado ou assinado durante estes testes.
- Navegador com respostas interceptadas: configuração, consentimento, erro/retry com a mesma UUID, edição e regeneração, copiar, Markdown sem HTML executável, documentos com vínculo/compartilhamento explícito, versões e leitura compartilhada. PDF foi realmente gerado e lido usando pdf-lib, com a logo original.
- Interrupção: digitar a próxima mensagem e clicar **Parar** preserva o próximo rascunho e não dispara uma segunda geração. A revisão corrigiu um envio involuntário causado pela reutilização do mesmo botão React entre `button` e `submit`.
- Layout: chat, documentos e ajuda contextual em larguras de 320 a 1440 px, com menu mobile e formulários sem rolagem lateral. Ajuda vira tela cheia no celular.
- PWA: atualização de 1.4.0 para 1.7.0 reconhecida, formulário pendente preservado, ativação explícita com um único reload, segunda aba preservada, cache sem API/dados privados e zero gravações no backend durante o fixture.
- Lint: zero erros e somente os três avisos preexistentes em `i18n.jsx` e `Site.jsx`. Type check Deno do backend passou. Varredura dos arquivos alterados não encontrou credenciais reais.

## O que ainda depende da chave

A conexão real com Gemini, disponibilidade efetiva dos modelos para a conta, conteúdo dos quatro modos e latência completa em produção **não foram aprovados**. O usuário informou que a chave ainda não foi criada. Os fixtures confirmam protocolo e interface, sem simular uma conexão real aprovada.

Após conectar um projeto sem faturamento em **DUUK AI → Configurar Gemini**, teste com dados fictícios: roteiro de 30 segundos; duas direções de campanha; estrutura de proposta sem preços oficiais; instruções para um módulo autorizado. Confirme streaming, interrupção, histórico após recarregar, cópia e PDF. Não use dados confidenciais na modalidade gratuita e não esgote cotas artificialmente.

Instruções de configuração, modelos, limites e comandos: [duuk-ai-setup.md](duuk-ai-setup.md).

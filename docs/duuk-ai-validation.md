# DUUK AI — validação de 8 e 9 de outubro de 2026

## Resultados da versão 1.7.0 — 8 de outubro

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

## Ativação real — 9 de outubro, versão 1.7.1

A pendência da chave foi resolvida. A conta `duukfilms@gmail.com` ativou o AI Studio; o projeto `gen-lang-client-0425131914` mostra Nível gratuito e Configurar faturamento. A chave de autenticação Google foi guardada no Vault pelo próprio formulário administrativo. Nenhum faturamento foi configurado e nenhuma credencial entrou em arquivos, clipboard, chat ou logs.

A validação real descobriu que o filtro legado `AIza` recusaria as chaves de autenticação atuais. A correção aceita o formato opaco observado, bloqueia caracteres inseguros e continua exigindo a validação real por `models.list`, antes de persistir. O teste de regressão usa somente strings fictícias construídas em código.

| Modo | Modelo real | Trechos SSE | Primeiro trecho | Total com histórico |
|---|---|---:|---:|---:|
| Ajuda | gemini-3.5-flash-lite | 3 | 2,7 s | 3,4 s |
| Roteiro | gemini-3.5-flash | 9 | 6,3 s | 7,9 s |
| Conceito | gemini-3.5-flash | 9 | 5,0 s | 6,8 s |
| Comercial | gemini-3.5-flash-lite | 8 | 2,0 s | 3,1 s |

Todas as respostas foram confirmadas pela consulta autenticada de histórico, com o mesmo ID e conteúdo. As amostras utilizaram uma cafeteria inteiramente fictícia e ajuda sobre a rota real Agenda → Novo compromisso. O primeiro conjunto consumiu 35.710 tokens contabilizados, em quatro tentativas. Os tempos são observações de amostras, sem promessa de latência futura.

A revisão semântica encontrou validade e revisão presumidas na primeira minuta comercial. O complemento de segurança `1.0.1` passou a exigir `[a definir]` para condições não informadas, e um novo teste real confirmou esse comportamento: sem validade de sete dias, revisões ou formatos inventados. Isso melhora a orientação, mas documentos produzidos pela IA continuam exigindo revisão humana. Não foram enviados dados reais de clientes.

Após a conexão, a verificação de segurança continuou retornando 401 para acesso anônimo e 403 para tentativa direta de acessar a RPC das credenciais. O status autenticado informou conexão ativa e versão de instruções 1.0.1, sem devolver a chave. A conversa técnica foi excluída após a validação, sem alterar registros reais de clientes; as cotas consumidas pelos testes foram preservadas.

Na versão 1.7.1, a suíte Node passou com **83 testes aprovados, zero falhas e um teste legado opt-in ignorado**. O type check Deno da função passou; os três testes do SDK oficial foram repetidos e passaram.

## Interface e atualização — versão 1.7.1

A interface reúne os modos no seletor da mensagem, recolhe o histórico por padrão e remove cabeçalhos e explicações repetidos. O aviso de privacidade foi movido para um diálogo com aceite obrigatório antes do primeiro envio; cancelar mantém o rascunho e não chama o modelo. A logo institucional foi preservada. O ajuste do teclado utiliza [VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport) localmente no chat, sem modificar o layout ou o viewport global do site.

O teste completo de navegador passou em larguras de 320 a 1440 px, nos dois formatos de chat e em alturas curtas. A simulação do teclado reduziu somente `visualViewport.height` para 360 px, mantendo `innerHeight` em 844 px; Enviar permaneceu acessível no painel e no popup. Foram confirmados consentimento/cancelamento/reset, UUID estável no retry, edição/regeneração/cópia, interrupção preservando a próxima mensagem, Markdown seguro, documentos/projeto/compartilhamento/versão/leitura/PDF e fechamento com rascunho. Zero erros JavaScript, chamadas externas reais ou gravações externas no fixture. Isso é uma simulação de viewport em navegador, sem alegar teste físico em iPhone.

O build de produção passou. Lint final: zero erros, com os mesmos três avisos anteriores em `i18n.jsx` e `Site.jsx`. A revisão independente não encontrou bloqueadores de segurança; um conflito de Escape em modais filhos foi corrigido.

O teste PWA de 1.4.0 para **1.7.1**, build `ec7c6c78612da9aa4eac`, passou: reconhecimento da nova versão, bloqueio da atualização com formulário pendente, um único reload na ativação explícita, segunda aba preservada, zero gravações de backend e nenhum dado privado no cache. A varredura dos 13 arquivos modificados não encontrou chaves Google atuais ou legadas, secrets Supabase, chaves privadas ou JWTs reais.

Instruções de configuração, modelos, limites e comandos: [duuk-ai-setup.md](duuk-ai-setup.md).

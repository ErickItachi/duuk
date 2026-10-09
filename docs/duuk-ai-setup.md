# DUUK AI — operação e configuração

O DUUK AI fica em `/admin/ai`, com a permissão `ai` e a autenticação já utilizada pelo painel. O botão discreto nas demais telas abre a mesma experiência em um painel lateral, ou em tela cheia no celular. O Google Drive continua sendo o último item do menu.

## Conectar o Gemini sem cobrança

A conexão central já está ativa desde 9 de outubro de 2026: conta `duukfilms@gmail.com`, projeto `gen-lang-client-0425131914`, identificado como **Nível gratuito / Configurar faturamento** no AI Studio. Nenhuma conta de faturamento foi configurada. A credencial foi transferida diretamente entre a sessão Google e o campo protegido do DUUK Admin, sem clipboard, arquivos, chat ou logs. Os passos abaixo servem para substituição futura da chave, por um super administrador.

1. Entre no [Google AI Studio](https://aistudio.google.com/api-keys) com a conta Google escolhida pela DUUK.
2. Crie uma chave da API Gemini em um projeto **sem faturamento ativado**. O projeto do Google Drive pode ser diferente; não reutilize segredos OAuth como chave Gemini.
3. Se o Console solicitar uma restrição de API, permita somente **Generative Language API**. A chave é usada por uma Edge Function: uma restrição por domínio de navegador não é apropriada para esta chamada de servidor.
4. Como super administrador, abra **DUUK AI → Configurar Gemini**, cole a chave no campo protegido e confirme que o projeto não tem faturamento ativado.
5. O servidor consulta `models.list` pela API oficial antes de salvar a chave criptografada no Supabase Vault. A chave não volta para o navegador nem entra em logs, conversas ou no repositório. Para substituir a chave, abra a configuração novamente.
6. Aceite o aviso de privacidade e envie um pedido com dados fictícios, por exemplo: “Crie um roteiro de 30 segundos para uma cafeteria fictícia, com equipe de duas pessoas”. Confirme a resposta progressiva e a permanência no histórico após recarregar.

Não envie a chave pelo chat, por e-mail ou em arquivos do Git. A alternativa de operação é definir `GEMINI_API_KEY` e `DUUK_AI_FREE_TIER_CONFIRMED=true` nos segredos da Edge Function. Uma chave conectada pelo painel tem prioridade. A confirmação de gratuidade pertence à origem da chave, sem aproveitar a confirmação de uma credencial diferente.

Sem chave configurada, o módulo informa a pendência e bloqueia geração. Documentos, autenticação e demais módulos continuam funcionando. A API Gemini não oferece, neste fluxo, verificação do faturamento do projeto: a confirmação administrativa precisa corresponder à configuração real do Google Cloud. Não ative billing para esta integração.

## Modelos e limites

A lista permitida é `gemini-3.5-flash-lite`, `gemini-3.5-flash` e `gemini-3.1-flash-lite`, com entrada e saída gratuitas na modalidade Standard consultada em 8 de outubro de 2026. A configuração escolhe o modelo leve disponível e o Flash para tarefas criativas, se disponível. A seleção usa modo, tamanho e intenção do pedido sem uma segunda chamada de classificação. Somente modelos retornados pela conta como capazes de gerar conteúdo podem ser usados.

Não há troca de modelo após erro de geração, retry automático do SDK, grounding, ferramentas externas nem fallback pago. Uma cota Google esgotada retorna erro visível. A disponibilidade e as cotas dependem do projeto e podem mudar; consulte [modelos](https://ai.google.dev/gemini-api/docs/models), [preços](https://ai.google.dev/gemini-api/docs/pricing) e [limites](https://ai.google.dev/gemini-api/docs/rate-limits) antes de atualizar a lista permitida.

Os limites iniciais por membro são cinco tentativas por minuto, 40 por dia e 100 mil tokens por dia, contabilizados no fuso de São Paulo. São configuráveis no backend em `duuk_private.ai_settings`; nunca aumente planos ou habilite cobrança. O Google pode impor cotas menores. Reservas conservadoras incluem prompt, manual, histórico e até 8.192 tokens de saída. Tentativas com consumo desconhecido, inclusive interrupções, mantêm a reserva: cancelar no navegador não garante que o Google interrompa o processamento. O histórico enviado fica limitado às últimas 20 mensagens e a 24 mil caracteres; a resposta tem limite de 64 mil caracteres e aproximadamente 100 segundos.

## Privacidade e permissões

Na modalidade gratuita, os termos do Google permitem utilizar conteúdo para melhorar os produtos. Por isso, cada sessão exige aceite antes do envio. Use briefings fictícios ou anonimizados, sem dados pessoais, contratos, informações financeiras ou outros dados confidenciais. Consulte os [termos do Gemini](https://ai.google.dev/gemini-api/terms).

O modelo recebe apenas o texto enviado, uma janela do histórico, o prompt mestre e a base de ajuda estática filtrada pelas permissões. A ajuda contextual inclui rota canônica, nome do módulo, ações e nomes dos campos; não inclui valores de formulários, IDs de registros, e-mails, contratos, agenda, financeiro, código-fonte ou credenciais. O assistente orienta e redige: não executa SQL, não altera módulos, não envia mensagens e não assina documentos.

Conversas são sempre particulares. Documentos têm edição, nomes, versões imutáveis e PDF com a logo original da DUUK. Vincular a um projeto não compartilha automaticamente: é necessário marcar a autorização. O compartilhamento permite leitura e exportação somente a membros com `ai`, `site` e acesso ao projeto existente, conforme o módulo atual; a edição continua exclusiva do autor. A exportação ocorre localmente, sem enviar documentos ao Drive nesta versão.

## Backend e publicação

Aplicar `supabase/duuk-ai.sql` uma única vez e publicar `supabase/functions/duuk-ai/index.ts`, incluindo os arquivos compartilhados importados. O fluxo usa a CLI quando disponível e MCP quando o binário local não inicia. O endpoint é `duuk-ai`; `verify_jwt=false` é intencional porque a função verifica o token pelo Supabase Auth e a permissão ativa no servidor em cada chamada. As RPCs de configuração e persistência são exclusivas de `service_role`. RLS e privilégios de leitura impedem acesso cruzado e escrita direta pelo navegador.

O prompt mestre fornecido pelo usuário está integralmente em `duuk-ai-system.mjs`, separado dos complementos de segurança; o conjunto de instruções está na versão `1.0.1`. Condições comerciais que o membro não informou devem aparecer como `[a definir]`, incluindo validade, revisões e formatos, sem tratar sugestões anteriores da própria IA como confirmação. A base versionada está em `duuk-ai-knowledge.mjs`; atualize o manual quando as telas mudarem. A logo Gemini local vem do [arquivo oficial do Google](https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d4735304ff6292a690345.svg), sem redesenho.

A versão 1.7.1 usa o changelog e o gerador de service worker existentes. O mecanismo de atualização preserva formulários pendentes e não armazena chamadas privadas da IA no cache. Publicar por `git push origin HEAD:main`, acompanhar a Vercel e verificar `admin-version.json`, `/admin/ai` e o site público.

## Validação

`npm test` cobre manual, permissões, seleção de modelos e protocolo SSE, além da suíte existente. `supabase/tests/duuk-ai.sql` verifica no banco real, dentro de transação com rollback, isolamento, conta desativada, compartilhamento explícito, versões, idempotência, leases, concorrência e limites. Não utiliza nem altera contratos de clientes.

O fixture de navegador usa respostas interceptadas para verificar chat, edição, repetição com o mesmo identificador, interrupção, documentos, PDF e larguras de 320 a 1440 px. O fixture do SDK usa transporte HTTP local para verificar o protocolo oficial e não comprova geração real.

Execute o transporte do SDK com `DUUK_AI_SDK_TEST=1 npx --yes deno@2.5.6 test --node-modules-dir=none --no-lock --allow-net=127.0.0.1 --allow-env supabase/tests/duuk-ai-sdk.integration.ts`. Os três casos cobrem paginação, texto incremental/uso final, cancelamento e resposta 429 com exatamente uma tentativa. A chave é fictícia e a rede fica restrita ao servidor local.

**Validação real em 9 de outubro de 2026:** a chave autenticou, `models.list` confirmou os modelos, e os quatro modos responderam pela API oficial com streaming e histórico confirmado no banco. O modelo leve configurado é `gemini-3.5-flash-lite`; o criativo é `gemini-3.5-flash`. O primeiro trecho chegou entre aproximadamente dois e seis segundos nessas amostras; isso não é uma garantia de latência. A proposta foi revisada e retestada após reforçar condições não confirmadas como `[a definir]`. Nenhum dado real de cliente foi enviado. Resultados em [duuk-ai-validation.md](duuk-ai-validation.md). Não esgote artificialmente a cota gratuita durante os testes futuros.

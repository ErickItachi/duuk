# Cobranças DUUK · Asaas

Módulo 2.6.0, solicitado pelo proprietário para cobrar clientes por Pix, boleto e cartão e receber na conta empresarial da DUUK, com CNPJ. A implementação usa a API oficial do Asaas. A conta empresarial de Produção foi conectada em 19/10/2026, com cadastro APPROVED e webhook ativo. Nenhuma cobrança real foi emitida para testar.

## Ativação pelo proprietário

1. Em Cobranças > Configurar Asaas, abra o Sandbox oficial e cadastre a conta empresarial de testes. No Asaas, gere uma chave de API com as permissões necessárias para leitura da própria conta, clientes, cobranças e webhooks. Chaves são separadas por ambiente.
2. Cole a chave somente no formulário do painel autenticado e informe o e-mail de avisos técnicos. A conexão verifica a conta empresarial, salva a chave no Vault e instala o webhook oficial automaticamente. Se o cadastro estiver pendente, conclua os passos no Asaas e use Conferir aprovação.
3. Homologue criação, pagamento simulado, atualização e cancelamento em Sandbox. Este teste com uma conta real do provedor ainda depende do cadastro da empresa; os testes de entrega usaram dados simulados e fixture SQL com rollback.
4. Cadastre o CNPJ real, representante legal, documentos e conta bancária diretamente no Asaas. Conclua a verificação da empresa; não envie documentos, senha ou chave pelo chat nem pelo repositório. A DUUK exige `personType=JURIDICA` e aprovação geral para emitir cobranças.
5. Conecte a chave de Produção, revise e aceite as tarifas na tela. Só Produção recebe dinheiro real. A primeira cobrança real exige revisão do cliente, valor, vencimento e forma de pagamento. Compartilhe o link manualmente.

Asaas informa ausência de mensalidade, com tarifas por recebimento e condições diferentes para cartão/parcelamento. Consulte a tabela e as condições da conta em https://www.asaas.com/precos-e-taxas. Nenhuma contratação de plano, antecipação, transferência, emissão fiscal, split, mensagem ou cobrança real foi feita. A DUUK envia `notificationDisabled=true` ao criar o cadastro do pagador, não envia e-mail/telefone de cobrança e não ativa juros, multa, envio postal ou antecipação. Configurações e serviços contratados fora do módulo continuam sob controle do proprietário no Asaas.

## Uso e limites

Cobranças aparece no menu da equipe com Financeiro. O mês é o do **vencimento**, não o fluxo de caixa bancário. Há pesquisa, filtros, paginação de 20 registros e privacidade visual de valores. Nova cobrança pede nome do cliente, CPF/CNPJ, descrição, valor a partir de R$ 5 e vencimento. O pagador escolhe Pix/boleto/cartão habilitados na fatura (`billingType=UNDEFINED`) ou a equipe solicita uma forma específica.

O documento é transmitido somente ao Asaas e não é persistido pela DUUK. No banco fica um HMAC para localizar o cadastro do mesmo pagador sem guardar CPF/CNPJ. O formulário usa memória e protege dados pendentes; fechá-lo elimina o documento local. Dados de cartão, CVV e senha bancária nunca passam pelo servidor DUUK. A fatura externa não é incorporada em iframe nem recebe o token DUUK.

Abrir/copiar a fatura não prova pagamento. `CONFIRMED` é “confirmado a liberar”; só `RECEIVED`, sem estornos, entra em “Recebido no Asaas”. Recebimento manual em dinheiro, contestação, recuperação e estornos ficam identificados e não são somados como liquidação. O valor líquido é exibido quando informado pelo provedor. Receitas/despesas e conciliação anteriores não são criadas ou alteradas automaticamente. Cancelar pede confirmação e somente exclui cobranças ainda abertas após consulta canônica; pagamentos, estornos, notas fiscais, parcelamento e serviços adicionais são administrados no Asaas.

## Segurança e recuperação

`duuk-billing` exige a sessão Auth válida, AAL2/TOTP e permissão Financeiro em cada ação do navegador. Configurar, reparar, atualizar aprovação e desconectar exigem super administrador. As três tabelas ficam em `duuk_private`, com RLS e sem acesso de anon/authenticated. `duuk_billing_backend` só pode ser chamada por `service_role` e repete autorização por membro. Respostas públicas omitem credenciais, identificadores do cliente, hashes, leases e conteúdo de webhook.

Chaves e token do webhook ficam no Vault. O callback valida segredo aleatório próprio no cabeçalho `asaas-access-token`, aceita o formato oficial de evento que contém `&`, guarda somente identificadores e deduplica por conexão/evento. Nunca salva corpo original com dados pessoais. Após persistir, confirma recebimento e consulta o pagamento pela API autenticada. Cliente, conta, referência DUUK, ID e centavos devem corresponder. Evento recebido, status enviado pelo navegador ou apenas o segredo do webhook não baixam a cobrança sem consulta canônica.

Cada criação tem UUID e hash estáveis, lease da conexão e marcadores antes dos POSTs. Repetir a mesma solicitação não emite uma nova fatura. Timeout, interrupção ou erro ambíguo ficam em verificação; o Cron usa somente GET para recuperar, sem repetir POST. Cadastro recuperado antes de iniciar pagamento pode voltar a “Pronta para concluir”; o autor informa o documento novamente. Tentativa de criação de cliente ainda inconclusiva bloqueia nova tentativa do mesmo pagador. Nunca remova esse bloqueio ou crie uma segunda fatura para contornar incerteza sem conferir o Asaas.

Fila persistente usa `FOR UPDATE SKIP LOCKED`, lease por tarefa/cobrança e backoff limitado. Há limites por usuário, limite global do painel, cooldown após 429 e nenhuma repetição automática de mutações HTTP. Conexões usam origens HTTPS fixas, timeout, bloqueio de redirects e mensagens de erro sem dados do provedor. Links de fatura só aceitam `/i/<id>` no domínio Asaas do ambiente correto.

Desconectar tenta remover apenas o webhook DUUK e sempre apaga credenciais locais; se o Asaas estiver indisponível, um webhook externo residual poderá permanecer, sem ser aceito pelo servidor. Faturas e histórico são preservados. Reconectar outra conta no ambiente com histórico é bloqueado. Reconecte a conta original. Rotação/invalidação de chaves no provedor é gerenciada pelo proprietário.

## Operação

- Migração: `supabase/migrations/20261017053011_duuk_client_billing.sql`.
- Função: `supabase/functions/duuk-billing/index.ts`, dependências `_shared/http.ts`, `session-claims.mjs`, `billing.mjs`. Deploy separado de Git/Vercel. `verify_jwt=false` permite callback/Cron, mas cada rota valida sua própria autenticação. Não aceite navegador sem `member()`.
- Cron `duuk-billing-sync`: a cada minuto, reutiliza segredo de Cron existente, sem serviço pago. Limpeza de tarefas concluídas em 90 dias. Cobranças e recibos de idempotência são privados e preservados.
- Fixture `supabase/tests/billing.sql`: rollback, identidades inventadas e zero HTTP. Unitários verificam o handler real com Auth/DB/API isolados, formatos, centavos, URLs, HMAC e falhas ambíguas. Browser cobre 320–1440 px, claro/escuro, revisão, formulários pendentes, configuração, detalhes, confirmação e cancelamento. Nunca faça cobrança real para testar.
- Advisors: tabelas privadas com RLS sem policies são intencionais. Nenhum novo RPC ficou executável por anon/authenticated. Preserve o plano gratuito e os avisos anteriores de recursos Pro.

Referências oficiais consultadas em 17/10/2026: https://docs.asaas.com/reference/criar-nova-cobranca, https://docs.asaas.com/reference/criar-novo-cliente, https://docs.asaas.com/reference/consultar-situacao-cadastral-da-conta, https://docs.asaas.com/reference/recuperar-dados-comerciais, https://docs.asaas.com/reference/criar-novo-webhook, https://docs.asaas.com/docs/about-webhooks, https://docs.asaas.com/docs/eventos-para-cobrancas, https://docs.asaas.com/docs/sandbox. O Checkout separado não oferece boleto; por isso foi escolhida a fatura de `/payments`.

Validação de entrega em 17/10/2026: 234 testes Node, 233 aprovados e um opt-in anterior ignorado; lint com os três avisos anteriores, Deno aprovado e build de fontes isoladas `42ca8e7c9c5688f1e491`. Browser: oito combinações 320/390/768/1440 px e claro/escuro, incluindo cancelamento e desconexão; regressão MFA completa em 320/1440 px e entradas privadas alternativas aprovada. Fixture SQL passou com rollback. Endpoints publicados recusaram ausência de Auth (401), origem externa (403), Cron forjado (403) e webhook sem segredo (401). Banco confirmou zero configurações/cobranças/tarefas, sem RPC executável por navegador. Edge Function duuk-billing v2 ativa. Homologação com uma conta Asaas real permanece pendente do cadastro/chave da empresa.


## Conexão real e abertura compartilhada · 2.6.1 · 19/10/2026

O proprietário concluiu a autorização SMS diretamente no Asaas. Foi criada uma única chave exclusiva **DUUK PAINEL ADMINISTRATIVO**, com operações de saque desativadas (Pix/TED/Pague Contas/recarga) e validade até **19/10/2027 às 23:59**, conforme a interface do provedor. Renovar antes do vencimento pelo formulário seguro. O valor foi transferido somente por memória para o formulário autenticado e salvo no Vault; não entrou em repositório, arquivo, clipboard, log ou chat. A exibição única foi fechada e a página navegada após confirmar o armazenamento.

A API confirmou conta JURIDICA, cadastro geral APPROVED e conexão de Produção. O webhook oficial **DUUK Cobranças production** apareceu Ativado no Asaas. O banco confirmou uma única configuração de Produção, segredos no Vault e zero cobranças reais. Os dois membros ativos com Financeiro obtêm o mesmo status central; o terceiro membro mantém as permissões anteriores. Não foram criadas contas Asaas individuais, alterados acessos ou emitidas cobranças, transferências ou mensagens a clientes.

Sem ambiente explícito no endereço, Cobranças consulta o status central e abre Produção quando ela está configurada; caso contrário, abre Sandbox. `?ambiente=sandbox` continua sendo uma escolha explícita de testes. Fechar a configuração após trocar de Sandbox para Produção conserva o ambiente no endereço e após recarregar. Isso corrige o callback antigo que conservava a seleção na tela, mas recolocava Sandbox na URL.

Validação real da criação/liquidação/cancelamento com conta Sandbox ainda está pendente de cadastro/chave desse ambiente. Os testes automatizados de emissão permanecem isolados. Não use uma cobrança real para homologar. A conexão de Produção foi validada sem modificar clientes ou recebimentos.

Validação 2.6.1: 234 testes Node, 233 aprovados e o opt-in anterior ignorado; lint mantém somente três avisos anteriores. Build de fontes isoladas `fb37eeda502776f5dc32` e oito combinações de UI 320–1440 px/claro–escuro aprovados. A regressão reproduziu a configuração de Produção partindo do Sandbox, conferiu URL/reload e abriu a mesma conta com outro perfil autorizado sem oferecer uma conexão pessoal. O Sandbox explícito continuou funcionando. As leituras reais de Produção confirmaram APPROVED, webhook Ativado, um único status compartilhado pelos dois membros autorizados e zero cobranças emitidas.

# DUUK Admin 1.11.0 — Extratos e Meu Pluggy

Base publicada: `333b53b887e803ee7b1496ad28edc56734459f55`, Admin 1.10.1. Trabalho exclusivo no checkout duuk-admin-live, branch feature/duuk-platform; checkout original e site institucional preservados.

## Alterações

Correção das margens internas inexistentes em Extratos, filtros, cabeçalho, cartões independentes e histórico responsivo. Valores muito longos passam a cartões completos no celular. Remoção confirmada de importações pela interface, preservando lançamentos, e mês/endereço ajustados ao arquivo importado. O arquivo real anterior e seus dois movimentos foram removidos a pedido do proprietário, com auditoria; três despesas anteriores preservadas.

Meu Pluggy real: configuração central criptografada, status, escolha/troca de conta e desconexão; consulta de saldo/data e movimentos por mês, filtro/busca e CSV. API oficial, exclusivamente conector 200 gratuito de dados próprios. Sem criação automática de lançamentos, cache persistente no navegador, dados bancários na IA, pagamentos ou plano pago. Logo oficial local. Conta pessoal do proprietário autorizada para teste; PJ será conectada posteriormente pelo usuário.

## Validação antes da publicação

- Node: 150 testes, 149 aprovados e um opt-in anterior ignorado. Onze testes novos cobrem proxy real, banco/moeda, centavos, datas Brasil/UTC, isolamento de conta, origem/paginação, projeção mínima, erros, autenticação privada e proteção de CSV.
- Lint: sem erros/avisos novos; três avisos anteriores do site. Build de produção aprovado; aviso anterior de chunks maiores que 500 kB permanece. Frontend JS/JSX, sem novas dependências. Deno check --no-lock --no-config aprovado (sem alterar o lock existente), além da compilação no deploy Edge.
- Três fixtures SQL aprovadas com rollback: OFX anterior, remoção e Pluggy. Remoção conserva receitas/despesas vinculadas e outras importações, exige revisão/permissão, é idempotente e bloqueia reenvio antigo; nome do arquivo não conserva conta completa. Pluggy testa Vault, segredo não exposto ao frontend, revisão, bloqueio de conectores diretos/sem consentimento, permissões e audit privado, desconexão.
- Advisors: configuração privada sem policies é intencional, inacessível ao navegador. O aviso de SECURITY DEFINER executável em authenticated inclui a RPC de remoção, deliberadamente com autorização atual e testes de membro financeiro, sem permissão, desativado/anônimo. O aviso anterior de proteção de senha vazada não foi alterado.
- Navegador: 118 casos aprovados, sem erros JS ou chamada inesperada. 320/390/768/1024/1440 px, claro/escuro, incluindo margens internas mínimas de 20 px, valores em uma linha, filtros, prévia, vínculo, remoção/conflito, histórico, troca automática de período, conta conectada, pendentes fora dos totais, CSV filtrado, falha de provedor, configuração com autorização e desconexão. Gravações ficaram nos fixtures em memória.
- Financeiro anterior: 63 casos aprovados de resumo, cadastro/baixa, metas, datas, filtros, conflitos e exportação. PWA: 25 casos aprovados da versão atual/futura, novidades, banner/Sobre, tema/loader e proteção de formulários.
- Backend real instalado: duuk-pluggy v1 ACTIVE, autenticação própria preservada; duuk-ai v11 ACTIVE, somente manual estático atualizado. Migrações 20261014060244 e 20261014062607 aplicadas.
- Conta real: credenciais validadas diretamente com /auth oficial, conector 200 confirmado não-Sandbox. Consentimento do Meu Pluggy concluído; uma conta BANK BRL. Configuração pelo endpoint DUUK com sessão autenticada retornou HTTP 200/saved. Consulta de outubro retornou HTTP 200, UPDATED, saldo em centavos e seis movimentos, resultado completo, sem CPF/titular/conta completa. Nenhum movimento foi copiado para receitas/despesas.

Artefatos locais de QA: ~/.codex/tmp/duuk194. Segredos temporários ficam fora do repositório com acesso restrito e são eliminados após instalação no Vault. Não incluir extratos reais, tokens ou credenciais em commits/relatórios.

## Limites

Atualização de origem a cada 24 h segundo o provedor; recorrência futura não foi observada neste teste. Conta PJ não conectada neste turno. Limite do extrato online: dez páginas/5.000 movimentos por mês, aviso de resultado parcial. Autorização bancária pertence ao usuário; não substituí-la por Sandbox ou conexão comercial paga. O bloqueio inicial do botão do portal foi observado e relatado em issue pública do provedor; o usuário posteriormente conectou o banco real.

Após push, verificar Vercel, domínio, versão/build/worker, sessão autenticada e site público antes de afirmar publicação.

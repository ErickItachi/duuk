# DUUK Admin 1.10.1 — extratos OFX e chave de tema

14 de outubro de 2026. Base: 1.10.0, commit `e6b79d27ce7ed389261c2b42ab62e3cbab43b577`, publicado e conferido no domínio, na sessão autenticada e no worker. A continuação acrescenta a importação gratuita escolhida pelo usuário para a conta Nubank PJ e troca o botão de tema por ícone/chave.

## Validação executada antes da publicação

- Testes Node: 139 testes, 138 aprovados e um teste opt-in anterior ignorado. Parser SGML/XML, entidades escapadas, datas, centavos inteiros, limites, duplicados, identidades conflitantes, arquivos inválidos/externos, moeda e divergência de vínculo. Ajuda da IA continua estática, filtrada por permissões, sem dados ou ferramentas bancárias. Depois do ajuste dos textos finais, os 18 testes focados de OFX, ajuda e preferência de tema passaram novamente.
- Lint sem erros ou novos avisos; permanecem três avisos anteriores do site institucional. Build de produção aprovado; permanece o aviso de chunks maiores que 500 kB. Frontend JavaScript/JSX, sem novo TypeScript ou dependências.
- Migração aplicada: `20261014050206_duuk_bank_ofx_import.sql`. Fixture `supabase/tests/bank-ofx.sql` aprovada com rollback, incluindo repetição da solicitação, sobreposição de extratos, rollback integral de conflito, limite/moeda/data, revisão, criação e vínculo sem duplicação, reabertura, preservação ao desvincular/excluir e deduplicação separada por conta. Testa membro financeiro, membro sem permissão, desativado e anônimo; gravações diretas são recusadas, e a auditoria fica financeira.
- Advisors não apontaram novos problemas de segurança nas tabelas/RPCs bancárias. Índices recém-criados sem uso ainda aparecem como informação. As policies financeiras usam autorização atual; funções definer têm search_path vazio e permissão explícita, sem aceitar ator enviado pelo cliente.
- Navegador em 320/390/768/1024/1440 px, claro/escuro: 65 casos aprovados, sem erro JavaScript ou chamada inesperada. Extratos, valores longos, prévia, vínculo/criação e campos ficam dentro da tela. Chave de tema sem texto visível, com `role=switch`, estado, Space/Enter e acesso no menu mobile. Prévia não grava; descarte/rascunho protegido. Verificados importação, sobreposição, baixa sem duplicar, criação revisada, transferência ignorada, remoção que preserva lançamento, divergência após edição, bloqueio de XML externo e ações desativadas após falha de leitura. Os writes ficaram somente no fixture em memória, nunca no banco real.
- Regressões financeiras: 63 casos aprovados de resumo, datas efetivas, metas, filtros, conflitos, CSV e Excel com quatro planilhas; sem alterações nas despesas anteriores. PWA: 25 casos aprovados de notas atuais/futuras, loader, banner/Sobre, atualização explícita e proteção de formulários.
- DUUK AI v9 ACTIVE: os sete arquivos remotos coincidem com o checkout. Apenas manual/roteamento estático mudaram; mestre, Auth, consentimento, credenciais, cotas e ferramentas anteriores foram preservados. Não houve geração real com extratos.
- Consulta após os rollbacks confirmou três despesas anteriores, zero receitas, zero importações e zero movimentos bancários. Nenhum OFX, movimento de demonstração, mensagem ou pagamento real foi criado.

## Limites práticos

É importação manual de OFX, sem conexão automática, senha bancária ou mensalidade de parceiro. Arquivos: até 2 MB e 2.000 movimentos, conta em BRL e FITID obrigatório. O arquivo original e a identificação completa da conta não são armazenados; os metadados privados mostram os últimos quatro caracteres. Saldo informado tem a data do arquivo e não é uma consulta atual ao banco.

Os testes usaram arquivos OFX sintéticos nos formatos SGML/XML e fixtures isoladas. Não foi fornecido nem importado um extrato real do usuário; a primeira exportação real do Nubank será feita pelo usuário no fluxo publicado. Importação não declara créditos como receita automaticamente: transferências internas e valores já contabilizados precisam ser ignorados ou vinculados ao lançamento existente.

Após o push, conferir Vercel, metadata/worker da versão 1.10.1, sessão autenticada em Financeiro > Extratos e site público. Registrar os resultados reais da publicação na sessão e nos artefatos locais; testes pendentes não são tratados como aprovados.

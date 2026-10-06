# Fluxo de trabalho da DUUK

## Site e painel publicados

O usuário autorizou publicar o painel administrativo em produção e aplicar as alterações ao site público ao salvar.

- O painel fica em `https://www.duukfilms.com/admin`, protegido por Supabase Auth e autorização no servidor.
- Não inclua links, botões ou avisos sobre o painel nas páginas públicas da DUUK.
- Salvar um projeto ou a abertura deve atualizar o site público numa única transação, sem um segundo botão de publicar. Projetos com status rascunho/arquivado continuam privados.
- Mantenha Supabase no plano gratuito. Não contrate serviços, aumente planos ou habilite cobrança. O usuário aceitou links do YouTube para vídeos grandes, inclusive na abertura, mantendo uploads diretos com limites gratuitos.
- Senhas e chaves de serviço não podem entrar no repositório nem no navegador.
- O usuário autorizou ampliar e publicar o administrativo: visão geral, PDFs e assinaturas, despesas e insights, mantendo o portfólio e a abertura.
- Os contratos começam com upload de PDFs prontos. Não implemente geração de modelos nesta etapa. Cliente e DUUK assinam por links privados separados, válidos por sete dias, compartilhados manualmente pelo administrador.
- Preserve o PDF, os campos e as assinaturas após gerar links. Assinaturas são eletrônicas por aceite e desenho, sem certificado ICP-Brasil nem verificação de identidade por e-mail. Não apresente o fluxo como assinatura certificada.
- Contratos, evidências e despesas são privados. Insights contam atividade pública agregada, excluem o administrativo, respeitam GPC e têm retenção de 90 dias. Não contrate analytics ou assinatura externos.
- Preserve alterações locais alheias à tarefa. O checkout original tem alterações anteriores ainda não publicadas.
- Conclua os testes, faça commit e envie as alterações desta tarefa para `origin/main`. Aguarde a Vercel e confira o domínio antes de afirmar que está online.

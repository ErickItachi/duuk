# Fluxo de trabalho da DUUK

## Site e painel publicados

O usuário autorizou publicar o painel administrativo em produção e aplicar as alterações ao site público ao salvar.

- O painel fica em `https://www.duukfilms.com/admin`, protegido por Supabase Auth e autorização no servidor.
- Não inclua links, botões ou avisos sobre o painel nas páginas públicas da DUUK.
- Preserve a logo original em `public/media/duuk-logo-white.png`, sem redesenhar, recolorir ou acrescentar outra marca. O administrativo usa a paleta e a tipografia do site da DUUK; verifique celular, tablet e desktop, incluindo menu, modais e PDFs.
- Salvar um projeto ou a abertura deve atualizar o site público numa única transação, sem um segundo botão de publicar. Projetos com status rascunho/arquivado continuam privados.
- Mantenha Supabase no plano gratuito. Não contrate serviços, aumente planos ou habilite cobrança. O usuário aceitou links do YouTube para vídeos grandes, inclusive na abertura, mantendo uploads diretos com limites gratuitos.
- Senhas e chaves de serviço não podem entrar no repositório nem no navegador.
- O usuário autorizou ampliar e publicar o administrativo: visão geral, PDFs e assinaturas, despesas e insights, mantendo o portfólio e a abertura.
- Os contratos começam com upload de PDFs prontos. Não implemente geração de modelos nesta etapa. Cliente e DUUK assinam por links privados separados, válidos por sete dias, compartilhados manualmente pelo administrador.
- Preserve o PDF, os campos e as assinaturas após gerar links. Assinaturas são eletrônicas por aceite e desenho, sem certificado ICP-Brasil nem verificação de identidade por e-mail. Não apresente o fluxo como assinatura certificada.
- O usuário autorizou a agenda e a exclusão de contratos: use lixeira com restauração e revogação dos links. Só permita exclusão definitiva sem assinaturas recebidas. Despesas exportam Excel e CSV conforme mês e filtro. A agenda usa horários locais de Brasília.
- O usuário escolheu o painel escuro, com preto, coral e laranja. O menu do desktop pode ser minimizado, preservando a navegação no celular.
- A integração com Nubank foi apenas uma pergunta: não conecte contas, solicite credenciais ou contrate provedores sem instrução do usuário.
- Contratos, evidências e despesas são privados. Insights contam atividade pública agregada, excluem o administrativo, respeitam GPC e têm retenção de 90 dias. Não contrate analytics ou assinatura externos.
- Preserve alterações locais alheias à tarefa. O checkout original tem alterações anteriores ainda não publicadas.
- Conclua os testes, faça commit e envie as alterações desta tarefa para `origin/main`. Aguarde a Vercel e confira o domínio antes de afirmar que está online.

## Plataforma 1.0.0

- CRM, equipe, perfis, permissões, auditoria, notificações e PWA integram o mesmo administrativo. Preserve a autorização por módulo no frontend, nas Edge Functions e no banco; exceções individuais prevalecem sobre o grupo. Nunca remova a proteção do último super administrador.
- A caixa é Titan adquirido pela GoDaddy. Um super administrador conecta em Comercial > E-mails > Conectar Titan, usando a senha da caixa. A Edge Function valida IMAP/SMTP e guarda a credencial criptografada no Vault; as RPCs de credenciais são exclusivas de `service_role`. `DUUK_MAIL_PASSWORD` continua como fallback legado, sem prioridade sobre o Vault. Não confunda a credencial da caixa com a senha de login do painel.
- `src/admin/releases.json` é a fonte única de versões. A PWA aguarda atualização explícita, protege formulários pendentes e nunca guarda dados privados em Cache Storage. Publique a notificação da versão somente após confirmar o frontend no domínio.
- Consulte `docs/duuk-admin-operation.md` para operação, limites, configurações externas e validação.

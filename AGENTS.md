# Fluxo de trabalho da DUUK

O usuário quer ver as alterações concluídas em `https://www.duukfilms.com/` sem fazer o envio manualmente.

## Painel administrativo em preview

O usuário pediu expressamente que o painel administrativo seja desenvolvido e publicado apenas em preview, agora com integração real a um Supabase exclusivo de testes. Esta instrução tem prioridade sobre o fluxo de produção abaixo para essa funcionalidade.

- Trabalhe na branch `preview/admin-panel` e envie apenas para essa branch. Não faça merge ou push do painel para `main` sem autorização posterior do usuário.
- Compartilhe o endereço de preview da Vercel com `/admin`. A versão pública em `duukfilms.com` deve continuar na versão de produção.
- O Supabase DUUK Preview é exclusivo deste ambiente. Login, conteúdo e uploads devem persistir na nuvem. Nunca exponha senhas ou chaves de serviço no código do navegador. Não conecte dados de produção.
- Em builds com `VERCEL_ENV=production`, mantenha a demonstração e a rota de admin desabilitadas.

## Publicação de alterações no site público

- Depois de concluir e validar uma alteração solicitada neste projeto, faça commit dos arquivos e trechos dessa tarefa e envie para `origin/main`. A integração existente com a Vercel publica a branch `main` automaticamente.
- Preserve alterações locais e arquivos preparados por outras tarefas. Não inclua mudanças alheias ao pedido no commit.
- Se houver mudanças remotas, integre-as sem descartar trabalho local e sem usar force push.
- Aguarde a publicação e confira no domínio o comportamento ou conteúdo alterado antes de afirmar que está online. Se a publicação falhar, informe o motivo.
- Salvar um arquivo local não atualiza o domínio imediatamente: o usuário poderá recarregar o site depois da publicação. Na prévia com `npm run dev`, o Vite atualiza os arquivos salvos automaticamente.

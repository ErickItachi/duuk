# Fluxo de trabalho da DUUK

O usuário quer ver as alterações concluídas em `https://www.duukfilms.com/` sem fazer o envio manualmente.

- Depois de concluir e validar uma alteração solicitada neste projeto, faça commit dos arquivos e trechos dessa tarefa e envie para `origin/main`. A integração existente com a Vercel publica a branch `main` automaticamente.
- Preserve alterações locais e arquivos preparados por outras tarefas. Não inclua mudanças alheias ao pedido no commit.
- Se houver mudanças remotas, integre-as sem descartar trabalho local e sem usar force push.
- Aguarde a publicação e confira no domínio o comportamento ou conteúdo alterado antes de afirmar que está online. Se a publicação falhar, informe o motivo.
- Salvar um arquivo local não atualiza o domínio imediatamente: o usuário poderá recarregar o site depois da publicação. Na prévia com `npm run dev`, o Vite atualiza os arquivos salvos automaticamente.

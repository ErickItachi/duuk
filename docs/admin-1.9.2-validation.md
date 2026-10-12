# DUUK Admin 1.9.2 — aparência e atualizações

## Escopo

Refinamento do modo claro, marca original sobre coral/laranja, feedback de atualização dentro do banner e status de versão em Sobre. A ajuda DUUK AI tem movimento por mouse, toque e teclado, animação discreta e posição local por conta. O vídeo enviado pelo usuário foi convertido para MP4 H.264 de 117.736 bytes, sem áudio/metadados pessoais, com reprodução automática e poster para movimento reduzido. O arquivo original permanece intacto.

Novidades voltam para versões disponíveis/recém-instaladas. Fechamento por X, Escape ou botão é imediato e local, sem RPC. A abertura automática aguarda formulários pendentes, outra janela e carregamento. O histórico completo não foi restaurado. Atualizar continua explícito, com as proteções existentes da PWA; o MP4 fica fora do precache para preservar respostas Range usadas pelo Safari. Somente o poster entra nos recursos estáticos.

O site institucional conserva seu layout e carregamento anterior. O fallback compartilhado seleciona vídeo exclusivamente em `/admin`. Não houve alteração de autenticação, permissões, backend, contratos, assinatura, Drive, e-mail ou serviços pagos.

## Validação antes da publicação

- Suite Node: 118 aprovados, zero falhas e um teste opt-in preexistente ignorado. O teste ignorado não foi considerado aprovado.
- Lint aprovado com três avisos preexistentes em `src/i18n.jsx` e `src/components/Site.jsx`; build de produção aprovado. Permanecem avisos anteriores de tamanho de chunks.
- 38 verificações de UI em 320–1440 px: temas claro/escuro, persistência, menus, login sem perder os campos, pipeline, saudação automática e movimento reduzido. Sem rolagem horizontal de página ou erros JavaScript.
- 24 verificações de novidades/atualização: feedback contido no banner; status de Sobre com largura útil; notas automáticas, fechamento e persistência; erro de conexão explícito; fechamento offline com armazenamento bloqueado; proteção de rascunhos e adiamento da abertura automática. Sem gravações externas.
- Nove cenários da IA no preview de produção: arraste, limites, persistência, setas, rodapé, responsividade, confirmação de rascunho e restauração de foco. Toque e teclado móvel também foram emulados; não representam teste em iPhone físico.
- Reprodução real H.264, automática/muda/inline e sem controles, no Google Chrome nativo. Enquadramento final conferido em 320 × 900, 1440 × 900 e 844 × 390; movimento reduzido usa imagem estática. O Chromium de testes sem codecs H.264 não reproduziu o vídeo e não foi usado como evidência de reprodução.
- Revisão final dos fluxos de versão, notas por conta e bloqueio de formulários não encontrou defeitos adicionais. Logo original e alterações alheias do checkout antigo preservadas.

As verificações locais de interface usam respostas isoladas/interceptadas. Nenhum e-mail, push, pedido à IA, assinatura ou alteração de dados comerciais foi enviado nesses testes.

## Publicação

Commit `22204837f2ce7ff0e6d5de9e8d5026625a589467` enviado a `origin/main`; Vercel concluída com sucesso. Domínio confirmou 1.9.2/build `aa4c828464eceb062dff`, Admin e site público com HTTP 200. Vídeo publicado tinha bytes idênticos ao asset validado, tipo `video/mp4` e resposta Range 206. O worker confirmou build/poster corretos, sem MP4 no precache.

A sessão autenticada confirmou a atualização explícita 1.9.1 → 1.9.2, preservou o login e exibiu automaticamente as novidades. Sobre confirmou a versão mais recente. Depois desta publicação, o usuário pediu retirar o vídeo e deixar a logo sem caixa de fundo; a correção 1.9.3 substitui esses dois tratamentos visuais, mantendo as demais melhorias.

## Verificação da correção 1.9.3

O usuário autorizou renderizar o PNG branco em preto no modo claro. O arquivo original continua intacto; a marca do menu/cabeçalho usa brightness(0), sem fundo, borda, padding, sombra ou faixa coral. No escuro e no site público o filtro não se aplica.

Build e lint novamente aprovados, com os avisos preexistentes. A marca passou em 320/390/768/1024/1440 px e menu recolhido, sem overflow/erros JavaScript; modo escuro confirmou ausência de filtro. As 25 verificações no preview de produção passaram para banner, Sobre, novidades, persistência/fechamento offline, proteção de formulários e carregamento simples em 320 × 900, 1440 × 900 e 844 × 390, sem vídeo ou botão e respeitando movimento reduzido. Nenhuma gravação externa foi feita. A validação da publicação usa novamente a versão/build do domínio e a atualização explícita da sessão autenticada.

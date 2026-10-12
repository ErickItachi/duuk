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

Build esperado: `aa4c828464eceb062dff`. O resultado do push, deploy e conferência do domínio será registrado após a publicação. Validações de produção ainda não estão aprovadas nesta etapa.

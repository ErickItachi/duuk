# Spotify pessoal no DUUK PAINEL ADMINISTRATIVO — 2.5.0

O usuário autorizou criar/publicar o módulo, conectar a própria conta e configurar o aplicativo no navegador do Mac. O app **DUUK Música** foi criado na conta Spotify for Developers já autenticada. Client ID público: `329f1f34063447789d753d0c68bccd62`. Retorno exato: `https://www.duukfilms.com/admin/spotify`. Web API e Web Playback SDK foram selecionados no cadastro; esta entrega usa **Web API e o Embed oficial**, sem executar SDK remoto no contexto administrativo. Não foi lido nem armazenado Client Secret. O Client ID foi salvo pelo endpoint real com a sessão MFA atual do proprietário, HTTP 200.

## Por membro

Spotify aparece em **Seu espaço**, antes do Google Drive, e em Integrações. Toda conta DUUK ativa com MFA pode abrir o módulo e conectar somente sua própria conta. Um superadministrador configura o aplicativo central; isso não conecta nem consente por outras pessoas. Estados OAuth PKCE duram dez minutos, têm uso único e são vinculados ao membro e à sessão DUUK. Uma conta Spotify só pode estar associada a um membro DUUK por vez.

As três tabelas ficam em `duuk_private`, com RLS e sem grants de navegador. A RPC `duuk_spotify_backend` só permite service_role. A Edge Function aplica o `member()` existente: JWT confirmado pelo Auth, sessão viva, fator TOTP e membro ativo. Nenhum parâmetro do navegador escolhe outro ator. Tokens de acesso/renovação e verificadores PKCE ficam no Vault; não são devolvidos ao navegador, localStorage, IA, analytics ou repositório. Leases e geração impedem que uma renovação atrasada restaure uma conta desconectada. Exclusão do membro limpa segredos por trigger; o Cron diário limpa os estados OAuth vencidos.

## Funções

- Biblioteca pessoal: playlists, curtidas, álbuns, artistas seguidos, podcasts, episódios e audiolivros. Histórico recente e top itens são retornos originais do Spotify, sem novas métricas/perfis ou persistência na DUUK.
- Busca nas categorias permitidas; detalhes e itens de álbuns, playlists, artistas, podcasts e audiolivros; links e atribuição ao Spotify.
- Salvar/remover da biblioteca e seguir/deixar de seguir; criar playlists privadas por padrão, editar metadados/visibilidade, adicionar/remover/reordenar itens nas playlists em que o Spotify conceder permissão.
- Reprodução por dispositivo: estado atual, play/pause, anterior/próxima, posição, volume quando suportado, aleatório, repetição, fila e transferência explícita. Transferir não inicia a reprodução automaticamente.
- Player oficial do Spotify em iframe de origem separada, carregado apenas depois do clique e preservado ao navegar entre módulos. Fechar o player remove o iframe. O login/reprodução do Embed é controlado pelo próprio Spotify e pelas cookies/restrições do navegador; o OAuth da API não fornece sessão ao Embed. Para o controle integral da própria conta, abra também o Spotify em um dispositivo e selecione-o. Não afirmamos que todo navegador/PWA executa músicas completas no Embed.
- Não há downloads, gravação, remoção de anúncios, API não oficial, letras, recomendações/audio features removidas, sincronização entre membros ou compartilhamento da sessão Spotify. Recursos que o provedor negar mostram erro real, sem números inventados.

## Limites e custo

Não foi contratado serviço/plano nem habilitada cobrança. Spotify exige Premium do proprietário para apps Development Mode, até cinco usuários cadastrados e Premium para os controles de reprodução. Cada conta deve estar liberada em **User Management** pelo e-mail do próprio Spotify, e depois fazer seu consentimento individual. Não suponha que o e-mail DUUK seja o mesmo do Spotify. Mais contas dependem das regras/aprovação do provedor; não contorne a lista criando clientes para multiplicar quota.

A API limita 80 chamadas/minuto por membro, além do limite geral de 180 do administrativo. Consulta de reprodução a cada 30 segundos somente na página Spotify, com aba visível e conexão; erro interrompe polling até tentativa manual. `Retry-After` impõe pausa global persistente. Mutações não são repetidas automaticamente após falha de rede. Desconectar elimina o segredo na DUUK; a revogação no provedor é feita pela própria pessoa em https://www.spotify.com/account/apps/.

## Instalação e validação

Migração `supabase/migrations/20261016083123_duuk_spotify_personal.sql` aplicada pelo MCP; `duuk-spotify` tem deploy próprio, separado de Git/Vercel. Cron: `duuk-spotify-cleanup`, diário às 06h UTC. Fixture `supabase/tests/spotify.sql` passou antes/depois da instalação com rollback: contas/sessões cruzadas, replay, Vault, renovação concorrente, desconexão e respostas atrasadas, membro inativo, expiração e bloqueios de privilégios. Nenhuma conta real foi criada para esses testes.

Testes Node cobrem URLs/entradas, PKCE, protocolo de playlists/biblioteca 2026, isolamento de tokens, erros/quotas, mutações sem repetição e apresentação. UI usa APIs e áudios inteiramente simulados, 320/390/768/1440 px e ambos os temas, incluindo player, navegação persistente, CRUD, dispositivos e CSP. A suíte de MFA garante nenhuma consulta Spotify antes dos dois fatores; a suíte da IA verifica modais, teclado mobile, foco e rascunhos. Não reative contas nem altere bibliotecas reais para testar.

Os scripts da página administrativa continuam limitados à própria origem. Só `frame-src` recebe `https://open.spotify.com`; áudio e scripts do Spotify ficam no iframe oficial, sem acesso ao Auth da DUUK. O PNG oficial do Spotify foi baixado de `https://open.spotifycdn.com/cdn/images/favicon32.b64ecc03.png`, sem alterações. Preserve a marca original DUUK.

Referências verificadas em 16/10/2026: [PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow), [limites](https://developer.spotify.com/documentation/web-api/concepts/quota-modes), [mudanças de fevereiro](https://developer.spotify.com/documentation/web-api/references/changes/february-2026), [identificador estável de maio](https://developer.spotify.com/documentation/web-api/references/changes/may-2026), [quotas de julho](https://developer.spotify.com/documentation/web-api/references/changes/july-2026), [Embeds](https://developer.spotify.com/documentation/embeds), [política](https://developer.spotify.com/policy).

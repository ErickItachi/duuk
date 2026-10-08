# Google Calendar da DUUK

O código usa OAuth 2.0 real e a API oficial Calendar v3. A configuração está ativa desde 7 de outubro de 2026 no projeto Google Cloud **duuk-511001**, com cliente Web **DUUK Agenda**, público externo e status **Em produção**. `DUUK_GOOGLE_CLIENT_ID` e `DUUK_GOOGLE_CLIENT_SECRET` foram gravados diretamente nos Secrets das Edge Functions do Supabase, sem valores em arquivos ou no repositório. A conta **filmzerick@gmail.com** concluiu OAuth e teve um compromisso existente exportado: uma sincronização concluída, nenhuma pendente e nenhum erro. O guia abaixo documenta a configuração para manutenção; não recrie nem substitua o cliente existente sem necessidade.

O Console classificou os três escopos configurados como não confidenciais. O branding contém nome DUUK, domínio, página inicial e privacidade, mas a verificação da marca ainda não foi enviada/concluída: o Google pode mostrar **duukfilms.com** no consentimento em vez do nome DUUK. A conexão e o acesso em produção funcionaram nessa condição. Caso seja necessário exibir o branding verificado, siga [verificação de marca](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification), incluindo comprovação do domínio no Search Console. Não acrescente escopos nem envie informações falsas para obter verificação.

## Configurar o Google Cloud

1. Acesse [Google Cloud Console](https://console.cloud.google.com/) e selecione ou crie um projeto da DUUK. Mantenha o faturamento desativado; não contrate planos nem aumente cotas.
2. Em **APIs e serviços → Biblioteca**, ative **Google Calendar API**.
3. Em **Google Auth Platform → Branding**, configure nome **DUUK**, e-mail de suporte, domínio autorizado `duukfilms.com`, página inicial `https://www.duukfilms.com` e política de privacidade `https://www.duukfilms.com/politica-de-privacidade`. Informe também o contato do desenvolvedor.
4. Em **Audience**, escolha **External** para aceitar contas Gmail e contas de diferentes organizações. Enquanto estiver em **Testing**, cadastre como usuários de teste os e-mails Google de todos os membros que vão conectar. O Google normalmente limita a sete dias a autorização offline de aplicativos externos em testes com esse escopo; para uso contínuo, publique o consentimento e conclua a verificação que o Console indicar. Não prometa uma integração permanente enquanto o aplicativo estiver em testes.
5. Em **Data Access**, configure somente `openid`, `email` e `https://www.googleapis.com/auth/calendar.app.created`. Não adicione `calendar`, `calendar.events`, `calendar.readonly` nem outros escopos de agendas pessoais.
6. Em **Clients → Create client**, escolha **Web application**. Nome sugerido: **DUUK Agenda**. Cadastre este **Authorized redirect URI** exatamente, sem barra final:

   ```text
   https://www.duukfilms.com/admin/configuracoes/integracoes
   ```

   Este fluxo não usa o SDK Google no navegador; não exige uma origem JavaScript para trocar tokens. Não use o callback de login Google do Supabase Auth: a conta DUUK e a conexão Calendar são independentes.
7. Guarde o **Client ID** e o **Client secret** fora do repositório. Não envie o segredo por chat.

Referências oficiais: [escopos Calendar](https://developers.google.com/workspace/calendar/api/auth), [OAuth para aplicações web](https://developers.google.com/identity/protocols/oauth2/web-server), [expiração de tokens](https://developers.google.com/identity/protocols/oauth2#expiration) e [cotas de uso](https://developers.google.com/workspace/calendar/api/guides/quota). O uso padrão está dentro da faixa sem custo, sujeito às cotas do Google; não há promessa de uso ilimitado.

## Configurar o Supabase

No projeto **DUUK Preview**, referência `ilohuxhyfqikjlvoarts`, abra **Edge Functions → Secrets** e adicione:

| Nome | Valor |
| --- | --- |
| `DUUK_GOOGLE_CLIENT_ID` | Client ID do cliente Web criado acima |
| `DUUK_GOOGLE_CLIENT_SECRET` | Client secret do mesmo cliente |

Não use variáveis `VITE_`, configurações do navegador ou arquivos versionados. Os tokens de cada membro são gravados criptografados no Vault, separados das credenciais do aplicativo. Não é necessário mudar o login do painel nem habilitar Google em **Authentication → Providers**.

Depois, cada membro abre **Meu perfil → Integrações → Google Calendar**, toca em **Conectar Google Calendar**, escolhe a própria conta e concede a permissão solicitada. O membro precisa ter acesso ao módulo Agenda. O aplicativo cria um calendário separado **DUUK · Agenda da equipe** nessa conta.

## Funcionamento e limites

- A DUUK é a única fonte dos eventos. Criar, editar, cancelar ou excluir na DUUK enfileira as mudanças para cada membro conectado e autorizado. Eventos futuros e em andamento são incluídos para quem conecta depois; histórico encerrado não é importado.
- O worker roda a cada minuto, em lotes e com limite de tempo. A atualização é automática, mas pode levar alguns minutos conforme fila ou limites do Google. Não depende de manter o painel aberto.
- Não existe consulta a eventos pessoais, webhook do Google, `events.list` ou sincronização inversa. Respostas de escrita não alteram a tabela `duuk_events`. Editar ou apagar uma cópia no Google não altera a DUUK; a próxima edição na DUUK prevalece. Eventos inseridos manualmente no calendário criado pelo aplicativo também não entram na DUUK.
- `duuk_calendar_sync` mantém o ID DUUK, membro, calendário, ID Google, revisão desejada, estado, tentativas, erro e última sincronização. O ID Google é persistente, inclusive em reenvios. A fila preserva exclusões após o registro original ser apagado.
- Refresh tokens são usados exclusivamente no backend. OAuth usa state aleatório com validade de dez minutos, vínculo à conta DUUK autenticada, PKCE S256 e consumo único. Nova tentativa ou desconexão invalida fluxos anteriores.
- A fila usa lease por conexão e confirmação por revisão. Falhas temporárias recebem até oito tentativas com espera crescente e variação aleatória; o painel oferece **Tentar sincronizar**. Autorização revogada exige reconectar. Erros são curtos, em português e sem respostas privadas do provedor.
- Ao desconectar, o worker é invalidado e as credenciais locais são removidas; a revogação no Google é tentada. Eventos originais e cópias Google permanecem. Revogação remota também pode ser feita na conta Google. Ao reconectar a mesma conta, reutilizamos o calendário conhecido, se ele ainda existir; se a conta mudar, criamos outro calendário.
- Membros desativados ou sem permissão Agenda deixam de receber exportações. Mudanças de permissão não apagam cópias já enviadas à conta Google. O acesso é conferido antes de cada envio. Um pedido já em trânsito pode terminar durante a desconexão.

## Validação

Os testes de protocolo usam um transporte Google isolado: criação/edição/exclusão para duas contas, IDs estáveis, conflitos, tombstones, renovação, erros sem segredos e ausência de leitura de eventos pessoais. `supabase/tests/calendar-and-notifications.sql` roda no banco real com rollback de todas as contas, eventos e credenciais fictícias; verifica OAuth entre contas, repetição, permissões, backfill, fila, revisão, lease, reenvio, exclusão, desconexão, notificações e RLS. Nenhuma chamada externa é feita por esse teste.

OAuth e a primeira entrega externa foram validados com uma conta real em 7 de outubro de 2026. O painel retornou ao endereço correto, removeu o código OAuth da URL, mostrou a conta conectada e o worker confirmou a gravação de um compromisso já existente no Google. As credenciais ficaram no Vault e a fila terminou sem pendências. Não foram criados eventos fictícios na agenda compartilhada nem enviados avisos de teste à equipe.

Ainda falta validar CRUD externo completo, desconexão e múltiplas contas reais. Para isso, conecte uma segunda conta com consentimento do respectivo membro, crie um evento identificado como teste na DUUK, confirme nas duas contas, edite, exclua e confira a remoção das cópias. Crie um evento pessoal em cada conta e confira que ele não aparece na DUUK. Desconecte uma conta e confirme que os novos eventos continuam na DUUK e chegam somente à outra conta. Remova apenas os registros de teste. O teste de desconexão não deve interromper uma conexão real do usuário sem necessidade ou autorização.

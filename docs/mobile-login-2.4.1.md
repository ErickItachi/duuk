# Recuperação da entrada no celular — 2.4.1

Em 16/10/2026, o usuário informou que a senha era aceita, a tela já tinha o nome novo e aparecia “Confirme os dois fatores para acessar o painel.”, sem o campo do autenticador. Essa mensagem é uma resposta de MFA do backend; o catch do contexto a tratava como negação de acesso. A origem da divergência entre a avaliação local e a requisição do aparelho real não foi capturada. Um login novo simulado na versão publicada 2.4.0 mostrou o desafio normalmente, portanto não se atribui o problema apenas ao cache.

A consulta de identidade, nível de autenticação e contexto agora usa o mesmo token de sessão. Se o servidor ainda exigir MFA, o estado abre configuração/confirmação, mesmo se a avaliação local disser AAL2. Nenhuma autorização é concedida nessa recuperação; banco e funções continuam exigindo sessão AAL2 e fator TOTP verificado.

Também foi identificado um problema independente: versões anteriores a 2.4.0 só exibiam o botão de atualização depois do login, agora bloqueado pelo servidor. O novo worker acrescenta um script da própria origem ao HTML genérico dessas versões no cache. Ele mostra um botão na entrada antiga; ativação e recarregamento exigem clique, sem limpar credenciais, apagar arquivos ou interromper formulários. A versão 2.4.0 já possui atualização na entrada e seu shell não é alterado por esse mecanismo.

Os testes de navegador usam exclusivamente contas e respostas simuladas. Cobrem envio da senha, retomada de sessão e a resposta real de exigência de MFA do servidor, com configuração, código inválido/válido e bloqueio de consultas privadas, em 320 e 1440 px. Não foi usada senha, QR, código ou sessão do usuário real.

Face ID foi discutido como possibilidade por passkeys/WebAuthn. Não foi implementado nesta correção; o Supabase documenta essa API como experimental. MFA obrigatório por autenticador permanece.

Publicação: conferir origin/main e o status Vercel do commit desta entrega; só registrar online após consultar o domínio. Preservar as alterações locais anteriores em src/office/ContractsPage.jsx e tests/e2e/contracts.mjs. Se a máquina desligar, esta sessão não migra automaticamente; o deploy da Vercel continua após o push.

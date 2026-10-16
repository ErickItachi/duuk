# Segurança do site e do DUUK PAINEL ADMINISTRATIVO — 2.4.0

Auditoria autorizada em 16/10/2026, no checkout `duuk-admin-live`, branch `feature/duuk-platform`. O usuário escolheu **dois fatores obrigatórios para toda a equipe**. Nenhum plano pago, serviço novo, cobrança ou envio real de teste foi contratado/ativado. O checkout antigo e as duas alterações locais preexistentes de contratos foram preservados e não fazem parte desta publicação.

## Falhas e correções

| Achado | Tratamento |
| --- | --- |
| Apenas a senha liberava as operações privadas | TOTP gratuito obrigatório, com configuração por QR code/chave manual e confirmação de seis dígitos. Não há acesso aos módulos antes da confirmação. |
| Tokens de acesso podiam continuar úteis após logout até expirar | As policies e todas as funções privadas conferem a existência da sessão em `auth.sessions`, seu proprietário, expiração, AAL2 e o fator TOTP verificado da sessão. |
| O helper de visibilidade da biblioteca Drive usava só a permissão do membro | Também exige a validação de sessão/MFA central, preservando as restrições de pastas. |
| A conferência da senha atual substituía a sessão principal por um login de senha | Verificação em cliente temporário isolado, sem persistência/broadcast, encerrado em `finally`; a alteração usa a sessão AAL2 existente. Envia também `current_password` pelo protocolo oficial. |
| CORS aceitava localhost e previews do Vercel em produção | Somente os dois domínios oficiais da DUUK. Desenvolvimento local precisa da variável explícita `DUUK_ALLOW_LOCAL_ORIGINS=true`, que não foi habilitada em produção. Requisições sem Origin continuam dependendo da autenticação própria. |
| O site público podia iniciar conexões com qualquer servidor HTTPS | `connect-src` limitado à própria origem e aos hosts oficiais do projeto Supabase. Vídeos/imagens HTTPS e YouTube conservam os mecanismos existentes. |
| As páginas privadas autorizavam scripts remotos do YouTube sem utilizá-los | Scripts limitados à própria origem. Assinatura não permite frames; e-mail continua em iframe isolado, sem scripts. |
| O shell HTML direto não recebia todas as regras privadas | `/admin`, `/admin/:path*` e `/admin-shell.html` compartilham CSP, no-store, no-referrer, noindex e proteção de origem. A PWA leva os mesmos cabeçalhos no HTML gerado. |
| Faltava uma forma simples de encerrar acessos em outros aparelhos | Configurações > Segurança oferece encerramento oficial com `scope: others`, preservando o aparelho atual. Autenticador de reserva pode ser cadastrado; a interface impede remover o último. |
| Alguns endpoints administrativos não tinham limite geral por membro | Limite persistido de 180 chamadas/minuto, além dos limites mais restritivos de módulos/ações. |
| Novas senhas de oito caracteres e persistência marcada por padrão | Criação/redefinição via painel exige 12–128 caracteres; novos logins deixam “Manter conectado” desmarcado. Senhas existentes não são trocadas automaticamente. |
| Arquivos locais de ambiente/deploy podiam ser adicionados por engano | `.gitignore` protege `.env*`, `.vercel/` e temporários do Supabase, conservando os modelos `.env.example`. |

O nome visível mudou para **DUUK PAINEL ADMINISTRATIVO**, incluindo login, títulos, menus, Sobre, textos de uso, metadados de PDF e manifest da PWA. O nome curto do ícone é **DUUK PAINEL**. A logo original permanece intacta e o site público não ganhou referência ao painel. Anotações históricas e o prompt mestre original foram preservados.

## Banco, arquivos e integrações

O catálogo remoto confirmou 67/67 tabelas com RLS em `public`/`duuk_private`, nenhuma leitura anônima dos registros privados e cinco buckets privados com limites e MIME definidos. Não há views públicas que ignorem RLS nem função SECURITY DEFINER executável por `anon`, exceto o predicado privado que retorna falso para visitante. Os grants de backend continuam exclusivos de `service_role`.

Cadastro público, login anônimo e provedores externos do Supabase Auth continuam desligados. Nenhuma conta real foi reativada, redefinida ou cadastrada no autenticador pelos testes. Os registros falsos `@security.invalid` são inseridos somente dentro de uma transação com rollback; a consulta posterior confirmou zero remanescentes.

Migração: `supabase/migrations/20261016065523_duuk_session_mfa_security.sql`. Não muda as permissões de negócio ou dados existentes. O helper `member_permission(actor,...)` continua separado da sessão de navegador para os jobs autorizados de Calendar, Drive, notificações e Social Media. A nova RPC de sessão é exclusiva do servidor; o JWT é verificado pelo Auth **antes** de decodificar seus claims.

O deploy das Edge Functions é separado do Git/Vercel. Preserve o `verify_jwt` instalado e os arquivos remotos das integrações; atualize apenas o helper HTTP, sua nova dependência, a validação de senha do Team e o manual estático de Segurança da IA. Não substitua silenciosamente helpers remotos por versões locais que já diferiam antes desta tarefa.

Os sete Crons foram conferidos ativos, incluindo retenção de insights e limpeza diária das chaves temporárias. O Vault, TLS, consentimentos, cotas gratuitas, contratos, assinaturas privadas e integrações oficiais foram preservados. Assinantes externos não recebem exigência de TOTP da equipe; continuam sujeitos ao link privado e à confirmação de e-mail configurada no convite.

## Validação

- Node 22: 209 testes, 208 aprovados e um opt-in anterior ignorado. Lint: somente os três avisos anteriores. Build de produção aprovado.
- `npm audit`, incluindo dependências de desenvolvimento: zero vulnerabilidades reportadas. A varredura dos 358 arquivos de texto rastreados não encontrou service-role JWT, chave `sb_secret`, chave Google real, token GitHub ou chave privada PEM. Isso não é uma perícia do histórico inteiro de Git.
- `supabase/tests/session-mfa-security.sql`, com rollback: MFA válido, senha sem MFA, token de outro usuário, sessão encerrada, expiração, downgrade, fator não verificado, claim inválido, tentativa de escrita, acesso privado e preservação da leitura pública. Executado junto da migração dentro de transação revertida antes da instalação.
- Deno: três testes do helper HTTP e verificação de tipos das 11 Edge Functions. Conferem ordem de autenticação, sessão antes das permissões, CORS, cabeçalhos e limite real de tamanho de requisições transmitidas. A checagem completa usou cache externo de pacotes, sem mudar o lockfile antigo; a anotação de tipo da opção `signal` do Pluggy foi corrigida sem mudar seu comportamento.
- Regressões SQL de financeiro, OFX, remoção de importação e CRM/WhatsApp passaram com MFA fictício e rollback. `node scripts/prepare-sql-fixture.mjs supabase/tests/bank-ofx.sql` prepara fixtures antigas para a nova exigência: cria um helper temporário e só aceita contas `@test.invalid`, sem enfraquecer as regras reais. A fixture específica de segurança continua testando AAL1/revogação diretamente, sem essa adaptação.
- Navegador com Auth totalmente interceptado: seis fluxos de entrada/configuração em 320/768/1440 px, código incorreto/correto, ausência de consultas privadas antes do MFA, QR code renderizado, chave não persistida e CSP real bloqueando conexão externa. Duas validações de Segurança conferem o último fator e `scope: others`.
- 24 telas em modo claro/escuro e 320/768/1440 px, sem erros ou transbordamento. Regressão de financeiro, carregamento, marca da caixa, e-mail de código, som e ausência de janelas de novidades aprovada.

## Operação e limites

No primeiro acesso após atualizar, cada pessoa deve adicionar a DUUK ao próprio autenticador e confirmar o código. Guarde a chave num gerenciador de senhas ou cadastre um autenticador de reserva. Sem nenhum fator disponível, a recuperação precisa ser feita pelo proprietário no gerenciamento oficial do Supabase, com conferência de quem solicita; redefinir somente a senha não remove MFA. Nunca envie QR code, chave ou código pelo chat.

Uma PWA já instalada precisa receber a atualização explícita; não descarte formulários pendentes. Aparelhos com versão antiga devem atualizar antes de usar o painel protegido por MFA. O nome de um atalho antigo na Tela de Início pode ser mantido pelo sistema até recriar o atalho.

Não existe garantia de invulnerabilidade. Um token AAL2 roubado ainda pode ser usado até a sessão ser encerrada; um PDF já baixado não pode ser retirado do aparelho do destinatário. URLs privadas já emitidas continuam válidas por até 120 segundos; não ampliamos esse prazo. MFA por TOTP reduz roubo de senha, mas não elimina phishing em tempo real ou um aparelho comprometido.

A proteção automática de senhas vazadas do Supabase exige Pro e permanece desligada. Não ampliamos plano para eliminar esse aviso. O mínimo de 12 caracteres foi aplicado nos fluxos da DUUK; não afirmamos ter alterado a configuração global de senha do Auth sem acesso à sua configuração administrativa. Os avisos de funções autenticadas SECURITY DEFINER são RPCs autorizadas intencionais; as tabelas privadas sem policies são bloqueadas deliberadamente. [Explicação dos advisors](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [senhas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Proteções gratuitas adicionais que dependem das contas do proprietário: exigir 2FA também em GitHub, Vercel, Supabase, Google e Titan; guardar códigos de recuperação fora do aparelho; manter sistema/autenticadores atualizados; conservar uma cópia privada externa e testar sua restauração. Não armazenamos backups privados no repositório ou no site. Nenhuma mudança nas contas externas foi feita sem autenticação do proprietário.

Referências oficiais usadas: [TOTP gratuito](https://supabase.com/docs/guides/auth/auth-mfa/totp), [sessões e revogação](https://supabase.com/docs/guides/auth/sessions), [segurança dos produtos](https://supabase.com/docs/guides/security/product-security), [alteração de senha no Auth](https://github.com/supabase/auth/blob/master/internal/models/user.go).

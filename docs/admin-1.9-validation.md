# DUUK Admin 1.9.0 — validação e operação

Data: 10 de outubro de 2026. Trabalho realizado no checkout `duuk-admin-live`, branch `feature/duuk-platform`, preservando o checkout original e a versão publicada 1.8.0.

## Ajuste de aparência — 1.9.1

O controle de tema do celular era ocultado tanto no topo quanto pelo contêiner do menu. O ajuste reexibe os dois acessos, identifica o modo que será ativado e acrescenta texto no desktop e no login. A logo e a preferência por conta/aparelho foram preservadas. A saudação agora alterna automaticamente sem controles de play/pausa, mantendo suspensão em aba oculta e respeito à redução de movimento.

Validação local do incremento: 116 testes Node aprovados e um opt-in anterior ignorado; lint sem novos avisos (três anteriores); build de produção aprovado. Navegador com APIs interceptadas: 38 verificações, sem erros JavaScript, em 320, 375, 390, 430, 480, 680, 768, 1024 e 1440 px. Troca de tema, persistência após recarregar, acesso pelo menu, login com formulário preservado, pipeline, animação automática e movimento reduzido passaram. A marca e o botão do login não se sobrepõem em 320 px. Nenhum dado externo foi gravado. O incremento usa o versionamento e o mecanismo de atualização existentes.

## Recursos

O tema claro fica no topo do desktop e no início do menu do celular. A preferência é separada por conta e aparelho e sincroniza entre abas. A marca branca original continua sobre fundo escuro. O tema, os ícones e a cor da barra do navegador são restaurados ao sair do administrativo; as páginas públicas não receberam alterações.

O Drive já tinha renomeação no servidor. A interface agora oferece Renomear nas pastas e na pasta aberta, inclusive DUUK, e separa esse botão das demais opções de organização. Os limites de nomes seguem o servidor: 90 caracteres para pastas e 200 para arquivos, preservando a extensão. O backend do Drive e as credenciais Google permaneceram iguais.

A saudação usa o horário de Brasília e o primeiro nome. As frases abaixo dela têm digitação, pausa/retomada, suspensão em aba oculta e texto estático para movimento reduzido. Modais, presença e botões receberam transições curtas; a redução de movimento continua respeitada. O botão flutuante da IA deixou de cobrir o acesso a Sobre/atualização no rodapé.

## Confirmação antes da assinatura

O usuário escolheu código por e-mail, usando a caixa Titan existente, sem contratar SMS, WhatsApp automático ou outro serviço. Ao gerar um novo link, o administrador define o e-mail do participante. Esse endereço fica vinculado ao convite e não pode ser trocado por quem recebe o link. Depois de informar nome e e-mail, o participante recebe seis dígitos antes de acessar o PDF e assinar.

O código vale dez minutos, permite cinco erros e pode ser reenviado após sessenta segundos. Há limites de três pedidos por convite/endereço em quinze minutos e trinta por hora para a caixa. A prova de acesso vale trinta minutos, vinculada ao mesmo convite; fica apenas na memória da página. Recarregar solicita confirmação novamente. Links continuam válidos por sete dias; cancelar, excluir ou gerar outro link revoga o acesso anterior. Convites emitidos antes desta versão preservam seu comportamento até expirar. A integração não envia o link automaticamente.

Tokens/códigos não entram no repositório ou logs. Desafios usam HMAC com segredo criado no Vault; o banco guarda apenas hashes. RPCs e tabelas temporárias são privadas, exclusivas de service_role. Falhas de SMTP não abrem o documento nem repetem automaticamente um envio entregue. A senha Titan continua no Vault. A confirmação registra e-mail, horário e método no registro de aceite e no PDF final, com paginação das evidências; confirma acesso à caixa, sem identificação civil nem certificado ICP-Brasil. A assinatura, revisão transacional e fila do Drive existentes foram preservadas.

Instalação: aplicar `supabase/sign-email-verification.sql`, depois `supabase/sign-email-verification-integrity.sql`, e publicar `duuk-sign` e `duuk-office` com seus imports relativos. A segunda migração fortalece o CHECK contra valores NULL e cria índices para limites/retenção. Não há credencial Google nova ou segredo manual novo. A limpeza diária remove provas expiradas e desafios antigos; as evidências de assinatura persistem.

## Testes

- Node: 116 testes aprovados, um opt-in anterior ignorado. Nenhum teste pendente foi contado como aprovado.
- Lint: sem novos avisos; permanecem três avisos anteriores em Site.jsx/i18n.jsx.
- Build de produção aprovado. Avisos anteriores de chunks grandes permanecem.
- Deno: type check de duuk-sign/duuk-office e teste de PDF com evidência longa, paginação e preservação da página original aprovados.
- SQL real com rollback: novo/legado, RLS/grants, destinatário, estados de entrega/replay, cooldown, limites por convite/e-mail/global, cinco tentativas persistidas, validade do código/prova, limite de provas, revogação, lixeira, assinatura idempotente e evidências com método NULL. A fixture de pastas do Drive também passou.
- Navegador real, dados interceptados: 459 verificações do painel em 27 rotas, formulários e fluxos adicionais; 320, 375, 390, 430, 768, 1024, 1440 px e paisagem 844 × 390. Nenhum overflow de página/diálogo, erro JavaScript ou gravação externa. Tema claro passou também em 72 verificações, login, persistência, troca entre abas, preservação de formulário e saída ao site.
- Fluxo público de assinatura com API/SMTP interceptados: oito dimensões, bloqueio pré-código, erro de código, PDF, desenho, aceite, assinatura, download, expiração da prova e recarga. Nenhuma assinatura real foi criada.
- PWA: atualização real de service worker 1.8.0 → 1.9.0, espera explícita, proteção de formulário pendente, outra aba preservada e ausência de respostas privadas no Cache Storage.

As verificações de layout utilizam Chromium compatível com a máquina, não um iPhone físico. Não foram feitas assinaturas reais de clientes. A entrega SMTP foi validada na própria caixa contato@duukfilms.com com um PDF técnico temporário, sem assinar documentos de clientes. O pedido repetido recuperou o mesmo desafio sem reenviar. A publicação é conferida separadamente no domínio após o push.

## Backend publicado

As duas migrações foram aplicadas. duuk-sign versão 6 e duuk-office versão 9 estão ACTIVE. O advisor não encontrou novo apontamento nessas tabelas/funções; avisos informativos anteriores de RLS bloqueado e a proteção de senhas dependente do plano permanecem, sem alterar o plano gratuito. A varredura de 61 arquivos alterados/compilados não encontrou chaves Google, chaves de serviço Supabase, JWT service_role ou chaves privadas.

## Validação real das integrações

O código foi aceito pelo SMTP e recebido de verdade em contato@duukfilms.com. Um código incorreto foi recusado; o correto confirmou o e-mail e liberou o PDF privado com HTTP 200. O banco confirmou um único desafio, uma tentativa incorreta e uma confirmação, sem reenvio no replay. Nenhuma assinatura real foi registrada. O PDF técnico temporário ficou fora da sincronização do Drive durante o teste.

A API oficial do Drive também passou em criação e renomeação de uma pasta técnica vazia. O novo nome foi confirmado pelo Google e pelo banco; a pasta de teste foi depois enviada à lixeira, preservando as pastas e documentos existentes.

## Publicação e atualização

Commit de implementação `1e2accc815986b22202883b2440d8ed008969488` enviado para origin/main. A Vercel concluiu o deploy `EW5ACbimww5A5F3RP9BzeAzM3TTK`; domínio /admin e site público responderam HTTP 200. admin-version.json confirmou 1.9.0, build `7d32522346c4e0e1cc46`. A sessão real continuou autenticada; o botão reconheceu 1.9.0 a partir da 1.8.0 e Atualizar agora concluiu a troca. O worker ativo respondeu com o mesmo build e não havia respostas privadas no Cache Storage. Tema claro e meta único foram confirmados no domínio, com a logo original.

O link técnico publicado mostrou confirmação de e-mail sem expor PDF/campos antes do código. Revogar durante essa tela levou ao aviso para solicitar novo link, sem permitir novo envio. O contrato técnico, PDF original, convites, provas e fila temporária foram removidos; consultas no banco e no Storage confirmaram a limpeza. Nenhum contrato existente foi alterado ou assinado. A pasta vazia de teste do Drive permanece apenas na lixeira reversível.

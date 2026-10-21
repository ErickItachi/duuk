# DUUK 2.9.0 — clientes, fotos e identidade comercial

## Cadastro de clientes

O botão **Copiar pedido de dados** está no formulário de cadastro/edição e na ficha do cliente. O texto usa somente o primeiro nome na saudação, pede nome completo, empresa/razão social quando houver, telefone, e-mail, cidade, projeto e data/período, com Instagram/site opcionais. Não inclui observações internas, valores, responsável, tags ou outros registros. Não pede documentos que o cadastro não possui.

A prévia é texto simples e a cópia depende de gesto explícito. Se o navegador recusar o clipboard, a mensagem fica visível e selecionada para cópia manual; nenhuma confirmação de sucesso é mantida após a falha. Não há migração, API nova, envio automático ou registro de atividade por copiar. As permissões de Clientes permanecem as mesmas.

## Foto de perfil

JPG/PNG/WebP de origem de até 20 MB. O editor limita a imagem a 80 megapixels e permite arraste, controle por setas, zoom de 1× a 4× e centralização. A máscara circular representa o avatar; o arquivo salvo é quadrado. Cancelar descarta somente o enquadramento atual, preservando a foto anterior. Aplicar prepara um JPEG de 512 × 512 no navegador; apenas Salvar perfil envia. A exportação por canvas remove EXIF/GPS e não mantém o arquivo original no servidor.

O backend e o bucket privado continuam limitados a 2 MB por imagem. Não houve alteração de plano, Storage, RLS ou autorização. URLs temporárias são revogadas ao fechar/trocar a foto; o formulário e o editor participam da proteção de alterações pendentes.

## E-mail

O pedido final é logo branca sobre fundo laranja, usando os arquivos originais existentes. A variante gerada com letras laranjas foi descartada e ficou fora do repositório. No painel, o avatar comercial mantém o PNG branco e ganha o fundo da marca; remetentes externos continuam com iniciais.

O editor oficial do Titan salvou o ícone padrão na conta confirmada `contato@duukfilms.com`. A foto da conta Google existente `duukfilms@gmail.com` também foi salva no editor oficial, com visibilidade pública da marca, sem alterar dados de login ou integrações. A conta pessoal do proprietário foi preservada. Nenhum e-mail de teste foi enviado e nenhuma assinatura de mensagem foi criada.

Em 21/10/2026, após o proprietário confirmar a identidade diretamente no Google, `contato@duukfilms.com` foi adicionado como e-mail alternativo de `duukfilms@gmail.com`. A solicitação oficial recebida na caixa Titan foi conferida e seu link oficial abriu a página da conta correta, já com o endereço comercial e sem os estados “E-mail não verificado”, “Verificação necessária” e “Reenviar verificação”. O endereço principal da conta Google foi preservado. Nenhuma senha, código ou URL privada de verificação foi gravada. Isso confirma a associação, sem comprovar a aparência de uma mensagem recebida em outra caixa.

A versão 2.9.0 foi publicada pelo commit `f7a6608689e1167f4ed76865bd1c99a42cc66117`, com Vercel concluída e build `ae22f39c53d5b341c176` no domínio. A sessão autenticada confirmou o botão de cópia no formulário de novo cliente e o limite de 20 MB no perfil, sem salvar dados reais. O formulário vazio foi fechado. Cabeçalhos privados e site público permaneceram disponíveis.

A imagem exibida aos destinatários depende do provedor e do cache. A foto do Titan é própria daquele serviço. Para Gmail, uma identidade Google deve estar associada ao endereço que envia; a foto de outro endereço não comprova essa associação. Procedimentos oficiais: [foto Titan](https://support.titan.email/hc/en-us/articles/12499761435545-Profile-picture-for-your-Titan-account), [identidade para destinatários Gmail](https://support.titan.email/hc/en-us/articles/900005426463-Add-a-profile-image-for-recipients-on-Gmail), [foto Google](https://support.google.com/mail/answer/35529).

## Validação

268 testes Node passaram; um opt-in anterior foi ignorado. Build passou e lint conserva três avisos anteriores. O teste de navegador isolado usa um JPEG sintético acima de 2 MB: cancelamento não envia nada, teclado e zoom alteram o enquadramento, a aplicação fica local até salvar, o upload é único e resulta em JPEG de 512 px abaixo de 2 MB e sem EXIF. Verifica também limite de 20 MB, cópia sem escrita em Clientes, fallback manual e marca comercial.

Os cenários de 320, 390 e 1440 px passaram nos temas claro/escuro. A verificação final repete o cenário de 320 px após a correção da confirmação do clipboard e confere o remetente visível no composer. Não usa clientes, contas ou fotos reais e não envia e-mail, WhatsApp ou push. As alterações anteriores de contratos foram excluídas do artefato de revisão e devem permanecer fora do commit.

// Backend-owned manual. These are UI labels and static paths, never application records.
// Verified against AdminPage, ContractsPage, AgendaPage, CommercialPages, TeamPages,
// Notifications, MailPage and DrivePage. Update this version when those workflows change.
import { normalizedTaskText, taskFor } from './duuk-ai-quality.mjs'
export { taskFor } from './duuk-ai-quality.mjs'
export const knowledgeVersion = '1.1.0'

const pages = [
 { route: '/admin', module: 'Visão geral', actions: ['Atualizar', 'Abrir módulo'], fields: [], guidance: ['Os cartões e atalhos dependem das permissões do membro. O indicador de pessoas online reflete conexões ativas; o celular suspenso pode ficar offline.'] },
 { route: '/admin/ai', module: 'DUUK AI', permission: 'ai', actions: ['Nova conversa', 'Enviar mensagem', 'Interromper geração', 'Copiar resposta', 'Renomear conversa', 'Excluir conversa', 'Editar mensagem', 'Regenerar resposta', 'Privacidade', 'Revogar autorização'], fields: ['Mensagem', 'Modo'], guidance: ['Os modos são Criar roteiro, Desenvolver conceito, Assistente comercial e Ajuda com a DUUK. O assistente fornece texto e orientações; não executa ações nos demais módulos. Use exemplos fictícios ou anonimizados. O aceite de privacidade é salvo por conta e versão dos termos, inclusive no pop-up e em outros aparelhos. Abra Privacidade para consultar ou revogar a autorização. Após revogar, é necessário aceitar novamente antes de enviar ao Gemini.'] },
 { route: '/admin/contratos', module: 'Contratos', permission: 'contracts', actions: ['Novo contrato', 'Atualizar', 'Filtrar status', 'Abrir contrato', 'Mover para lixeira', 'Restaurar contrato'], fields: ['Título do contrato', 'Nome do cliente', 'E-mail do cliente · opcional', 'Representante da DUUK', 'Arquivo PDF'], guidance: ['Clique em Novo contrato, preencha os dados e envie um PDF pronto de até 10 MB e 30 páginas, sem senha. O painel abre a preparação dos campos. A lixeira preserva documentos e assinaturas e revoga os links anteriores. Restaurar não reativa links antigos.'] },
 { route: '/admin/contratos/:id', module: 'Preparação e assinaturas de contrato', permission: 'contracts', actions: ['Adicionar campo', 'Salvar campos', 'Gerar link', 'Baixar original', 'Baixar PDF assinado', 'Gerar PDF atualizado', 'Baixar registro de aceite', 'Tentar sincronizar'], fields: ['Página do PDF', 'Campo', 'Participante', 'Rótulo do campo', 'Esquerda', 'Topo', 'Largura', 'Altura'], guidance: ['Escolha a página, adicione os campos para cliente e DUUK, posicione-os no PDF e salve. Cada participante precisa de um campo de assinatura. Gere e compartilhe manualmente um link privado separado para cada participante; ele vale sete dias. Gerar outro link revoga o anterior daquele participante. Após gerar links, PDF e campos ficam bloqueados. O fluxo registra aceite e desenho, sem certificado ICP-Brasil ou verificação de identidade por e-mail. O PDF assinado e o registro de aceite podem ser baixados quando disponíveis. Falhas no Drive não interrompem as assinaturas.'] },
 { route: '/admin/agenda', module: 'Agenda', permission: 'agenda', actions: ['Novo compromisso', 'Editar compromisso', 'Excluir compromisso', 'Atualizar', 'Mudar mês', 'Selecionar dia'], fields: ['Título do compromisso', 'Tipo', 'Situação', 'Responsável pelo compromisso', 'Data inicial', 'Data final', 'Dia inteiro', 'Horário inicial', 'Horário final · opcional', 'Cliente · opcional', 'Local · opcional', 'Observações'], guidance: ['Selecione o dia e clique em Novo compromisso. Defina título, tipo, responsável e datas. Desmarque Dia inteiro para informar horários. O painel utiliza o horário de Brasília. Cada compromisso registra um responsável. A conexão do Google Calendar é individual e sincroniza apenas DUUK para Google; não importa eventos pessoais.'] },
 { route: '/admin/financeiro', module: 'Financeiro / Despesas', permission: 'finance', actions: ['Nova despesa', 'Editar despesa', 'Excluir despesa', 'Atualizar', 'Mudar mês', 'Filtrar situação', 'CSV', 'Exportar Excel'], fields: ['Nome da despesa', 'Valor (R$)', 'Vencimento', 'Categoria', 'Situação', 'Data do pagamento', 'Observações'], guidance: ['Clique em Nova despesa, informe valor e vencimento e salve. O mês do relatório é definido pelo vencimento. Ao marcar Pago, informe a data do pagamento. CSV e Exportar Excel usam os registros do mês e do filtro atual. Não existe integração bancária automática confirmada neste manual.'] },
 { route: '/admin/insights', module: 'Insights', permission: 'insights', actions: ['Atualizar', 'Selecionar período'], fields: ['Período'], guidance: ['Os indicadores são do site público, com retenção de 90 dias. Páginas administrativas e links de assinatura ficam fora dessa medição. O assistente não recebe os valores dos indicadores.'] },
 { route: '/admin/comercial', module: 'Dashboard comercial', permission: 'crm.dashboard', actions: ['Atualizar', 'Filtrar responsável', 'Selecionar período'], fields: ['Responsável', 'Contatos a partir de', 'Até'], guidance: ['O dashboard apresenta métricas dos registros comerciais reais, filtradas por responsável e período. O assistente não consulta esses registros nem conhece os resultados.'], additional: [{ permission: 'crm.clients', actions: ['Ver clientes'] }] },
 { route: '/admin/comercial/clientes', module: 'Comercial / Clientes e leads', permission: 'crm.clients', actions: ['Novo lead', 'Editar cliente', 'Excluir cliente', 'Buscar no Comercial', 'Filtrar responsável', 'Filtrar etapa', 'Ordenar clientes', 'Abrir detalhes', 'Anexar proposta ou documento PDF', 'Conversar no WhatsApp'], fields: ['Nome', 'Empresa', 'Telefone com DDI e DDD', 'Outro número de WhatsApp (opcional)', 'Nome do projeto', 'Data do evento', 'E-mail', 'Instagram', 'Site', 'Cidade', 'Segmento', 'Origem do lead', 'Responsável', 'Etapa', 'Primeiro contato', 'Próximo follow-up', 'Valor estimado (R$)', 'Tags', 'Observações'], guidance: ['Abra Comercial, Clientes e leads, Novo lead. Preencha nome e telefone com DDI e DDD, os demais dados necessários e clique em Salvar cliente. Projeto e data do evento são campos explícitos do cliente. Propostas e documentos PDF podem ser anexados nos detalhes do cliente e sincronizados com o Drive. Conversar no WhatsApp abre o link oficial; não envia mensagens nem registra contato automaticamente.'], additional: [{ permission: 'crm.activities', actions: ['Registrar contato realizado'] }, { permission: 'crm.followups', actions: ['Agendar follow-up'] }] },
 { route: '/admin/comercial/pipeline', module: 'Comercial / Pipeline', permission: 'crm.pipeline', actions: ['Atualizar', 'Mover negociação entre etapas', 'Abrir detalhes', 'Buscar no Comercial', 'Filtrar responsável'], fields: ['Responsável', 'Etapa'], guidance: ['Arraste o cartão para a etapa desejada e aguarde a confirmação. Em caso de erro, confira o aviso antes de tentar novamente. O assistente não move cartões nem confirma etapas reais.'], additional: [{ permission: 'crm.clients', actions: ['Novo lead', 'Editar cliente'] }] },
 { route: '/admin/comercial/contatos', module: 'Comercial / Contatos e atividades', permission: 'crm.activities', actions: ['Registrar contato', 'Atualizar', 'Filtrar responsável', 'Filtrar período'], fields: ['Cliente', 'Data e horário · Brasília', 'Canal', 'O que foi conversado?', 'Resultado', 'Próximo passo'], guidance: ['Registre somente contatos efetivamente realizados. Abrir WhatsApp, copiar um texto ou preparar uma mensagem não significa envio, leitura ou contato concluído.'], additional: [{ permission: 'crm.pipeline', fields: ['Atualizar negociação'] }, { permission: 'crm.followups', fields: ['Próximo contato (opcional)'] }] },
 { route: '/admin/comercial/modelos', module: 'Comercial / Modelos de mensagens', permission: 'crm.activities', actions: ['Editar modelo', 'Compor mensagem', 'Copiar mensagem', 'Abrir WhatsApp'], fields: ['Título', 'Mensagem', 'Cliente', 'Modelo'], guidance: ['Os modelos de WhatsApp usam variáveis de cliente, empresa, projeto e data. Revise o texto antes de abrir o link oficial wa.me. O envio é manual no WhatsApp; o painel não usa sessão de WhatsApp, não confirma entrega e não envia automaticamente. Registrar contato é uma ação separada.'] },
 { route: '/admin/comercial/follow-ups', module: 'Comercial / Follow-ups', permission: 'crm.followups', actions: ['Agendar follow-up', 'Reagendar follow-up', 'Concluir contato', 'Atualizar', 'Conversar no WhatsApp'], fields: ['Cliente', 'Responsável', 'Data e horário · Brasília', 'Observações', 'Resultado do contato', 'Próximo follow-up (opcional)'], guidance: ['Clique em Agendar follow-up, escolha cliente, responsável e data. Use Reagendar para trocar o horário e Concluir contato após realizá-lo. O resultado e um próximo contato podem ser registrados na conclusão.'] },
 { route: '/admin/comercial/relatorios', module: 'Comercial / Relatórios', permission: 'crm.reports', actions: ['Atualizar', 'Filtrar responsável', 'Filtrar origem', 'Selecionar período'], fields: ['Responsável', 'Origem', 'Contatos a partir de', 'Até'], guidance: ['Ajuste os filtros para consultar as métricas comerciais disponíveis. Não confunda valores estimados de negociações com receita recebida. O assistente não tem acesso aos números.'] },
 { route: '/admin/comercial/emails', module: 'Comercial / E-mails', permission: 'mail', actions: ['Atualizar', 'Novo e-mail', 'Pesquisar e-mails', 'Abrir pasta', 'Responder', 'Encaminhar', 'Anexar arquivo', 'Formatar texto'], fields: ['Para', 'Cc', 'Cco', 'Assunto', 'Mensagem', 'Anexos'], guidance: ['Escolha a pasta para ler mensagens e Novo e-mail para escrever. Revise destinatários, assunto, anexos e texto antes de enviar pelo próprio painel. Há formatação básica, resposta, encaminhamento e pasta Enviados. A conexão da caixa Titan é gerenciada por super administrador. Não envie senha da caixa ao DUUK AI. O assistente não lê, envia ou modifica e-mails.'] },
 { route: '/admin/portfolio', module: 'Site DUUK / Portfólio', permission: 'site', actions: ['Novo projeto', 'Editar projeto', 'Remover projeto', 'Ordenar filmes', 'Salvar no site', 'Filtrar visibilidade'], fields: ['Título', 'Cliente', 'Categoria', 'Ano', 'Descrição', 'Visibilidade', 'Destaque na home', 'Vídeo', 'Capa'], guidance: ['Abra Novo projeto ou um projeto existente, preencha o conteúdo e salve. Salvar no site aplica a alteração diretamente ao domínio público. Projetos em rascunho ou arquivados permanecem privados. Use as setas da lista para ordenar os filmes. Não há campos confirmados de responsável, prazo de produção ou conclusão no portfólio.'] },
 { route: '/admin/inicio', module: 'Site DUUK / Página inicial', permission: 'site', actions: ['Ver site', 'Salvar no site', 'Descartar alterações'], fields: ['Origem do vídeo · Desktop', 'Link do YouTube · Desktop', 'Vídeo de abertura · Desktop', 'Capa de abertura · Desktop', 'Origem do vídeo · Celular', 'Link do YouTube · Celular', 'Vídeo de abertura · Celular', 'Capa de abertura · Celular'], guidance: ['Configure separadamente a abertura e a capa de desktop e celular. Você pode escolher arquivo ou endereço HTTPS, ou vídeo do YouTube não listado com incorporação permitida. Salvar no site atualiza a abertura pública; não existe uma segunda publicação.'] },
 { route: '/admin/midias', module: 'Site DUUK / Biblioteca', permission: 'site', actions: ['Enviar mídia', 'Filtrar tipo', 'Remover mídia'], fields: ['Arquivo', 'Tipo de mídia'], guidance: ['A biblioteca de mídia do site é diferente dos documentos privados do Google Drive. Para vídeos grandes, prefira um link do YouTube conforme a configuração do projeto ou da abertura. Não envie contratos privados como mídia pública.'] },
 { route: '/admin/drive', module: 'Google Drive', permission: 'drive', actions: ['Atualizar', 'Nova pasta', 'Enviar arquivo', 'Abrir pasta', 'Editar nome e descrição', 'Mover', 'Mover para lixeira', 'Restaurar', 'Visualizar', 'Baixar', 'Tentar sincronizar'], fields: ['Busca', 'Categoria', 'Nome da pasta', 'Nome do arquivo', 'Descrição', 'Pasta de destino', 'Arquivo', 'Cliente · opcional'], guidance: ['Use Pastas para navegar, Todos os arquivos para pesquisar a biblioteca e Lixeira para restaurar itens. Nova pasta cria uma pasta no local atual. Organizar permite editar nome e descrição, mover ou enviar à lixeira. O conteúdo de origem de contratos e assinaturas permanece no painel. A raiz DUUK é protegida. Os uploads diretos aceitam até 20 MB. A conta de armazenamento é central e conectada por super administrador em Configurações, Integrações; membros não precisam conectar sua própria conta. Documentos de contratos e propostas respeitam também as permissões desses módulos. A lixeira do Drive é reversível e não exclui definitivamente evidências.'] },
 { route: '/admin/configuracoes/usuarios', module: 'Configurações / Usuários', permission: 'team', actions: ['Novo usuário', 'Editar usuário', 'Ativar ou desativar usuário', 'Redefinir senha', 'Buscar pessoa'], fields: ['Nome', 'E-mail', 'Telefone', 'Cargo', 'Grupo'], guidance: ['A gestão da equipe depende da permissão Usuários. Cada pessoa utiliza conta individual. Online indica conexão ativa e não monitoramento do computador. Senhas devem ser definidas apenas no formulário próprio, nunca nesta conversa.'] },
 { route: '/admin/configuracoes/grupos', module: 'Configurações / Grupos de acesso', permission: 'permissions', actions: ['Novo grupo', 'Editar grupo', 'Excluir grupo', 'Ajustar acesso por módulo'], fields: ['Nome do grupo', 'Descrição', 'Permissão por módulo'], guidance: ['Os grupos definem acessos por módulo. Revise as permissões ao atribuir um grupo. O assistente não concede acesso.'] },
 { route: '/admin/configuracoes/permissoes', module: 'Configurações / Permissões individuais', permission: 'permissions', actions: ['Selecionar pessoa', 'Ajustar permissão individual'], fields: ['Pessoa', 'Permissão por módulo'], guidance: ['A permissão individual pode complementar ou restringir a herdada do grupo. Apenas quem possui a permissão de gestão pode alterar os acessos.'] },
 { route: '/admin/configuracoes/perfil', module: 'Configurações / Meu perfil', actions: ['Editar perfil', 'Alterar foto', 'Salvar perfil', 'Atualizar acesso'], fields: ['Nome', 'Telefone', 'Cargo', 'Foto'], guidance: ['Atualize seus próprios dados e foto em Meu perfil. Para alterar a senha, use a seção Acesso e segurança do próprio perfil. Não cole senhas no chat.'] },
 { route: '/admin/configuracoes/integracoes', module: 'Configurações / Integrações', actions: ['Atualizar status'], fields: [], guidance: ['A página exibe conexões disponíveis de acordo com as permissões. O assistente não recebe status real da conta nem credenciais.'], additional: [{ permission: 'agenda', actions: ['Conectar Google Calendar', 'Reconectar Google Calendar', 'Tentar sincronizar', 'Desconectar conta'], guidance: ['Google Calendar conecta a conta individual do membro com consentimento. A sincronização é somente DUUK para Google; cada membro conecta a própria conta. Desconectar interrompe atualizações e mantém cópias já enviadas.'] }, { permission: 'drive', guidance: ['A conta central do Google Drive é conectada, reconectada e desconectada por super administrador. Membros com acesso ao Drive utilizam o armazenamento central sem conectar uma conta pessoal. Nenhum contrato é tornado público automaticamente.'] }] },
 { route: '/admin/configuracoes/historico', module: 'Configurações / Histórico de alterações', permission: 'audit', actions: ['Atualizar', 'Consultar alterações'], fields: [], guidance: ['O histórico registra ações administrativas reais. Ele é diferente de um histórico de versões do aplicativo. O assistente não consulta registros de auditoria.'] },
 { route: '/admin/configuracoes/notificacoes', module: 'Configurações / Preferências de notificações', actions: ['Ativar notificações neste dispositivo', 'Ajustar categorias', 'Testar notificação'], fields: ['Categorias', 'Permissão do dispositivo'], guidance: ['As notificações são ativadas por dispositivo e dependem da permissão do navegador ou sistema. No iPhone, use o painel instalado na Tela de Início e autorize os avisos por ele. Um teste deve atingir somente o aparelho da conta autenticada. As preferências não substituem as permissões dos módulos.'] },
 { route: '/admin/configuracoes/sobre', module: 'Configurações / Sobre o DUUK Admin', actions: ['Verificar atualização', 'Atualizar aplicativo'], fields: [], guidance: ['A atualização da PWA é explícita. Salve formulários pendentes antes de aplicar a nova versão. Não há janela automática de novidades nem histórico de versões na navegação.'] },
 { route: '/admin/notificacoes', module: 'Notificações', actions: ['Atualizar', 'Marcar como lida', 'Marcar todas como lidas', 'Filtrar categoria'], fields: ['Categoria'], guidance: ['O sino abre a central de notificações. Avisos do painel e push do celular são canais diferentes; push precisa ser autorizado em cada dispositivo. A entrega de um aviso não garante que o sistema operacional mostre um banner.'] },
]

export const knowledgePermissionKeys = Object.freeze([...new Set(pages.flatMap(page => [page.permission, ...(page.additional || []).map(item => item.permission)]).filter(Boolean))])

// Only the server may supply these grants after checking the current member in the DB.
function permissionSet(permissions) {
 if (permissions instanceof Set || Array.isArray(permissions)) return new Set([...permissions].filter(value => typeof value === 'string' && knowledgePermissionKeys.includes(value)))
 if (permissions && typeof permissions === 'object') return new Set(knowledgePermissionKeys.filter(key => Object.hasOwn(permissions, key) && permissions[key] === true))
 return new Set()
}

export function canonicalRoute(route) {
 if (typeof route !== 'string' || route.length > 2048 || Array.from(route).some(char => char.charCodeAt(0) <= 32 || char === '\\')) return null
 const path = route.split(/[?#]/, 1)[0].replace(/\/$/, '') || '/'
 if (path === '/admin/despesas') return '/admin/financeiro'
 if (/^\/admin\/contratos\/[A-Za-z0-9_-]{1,80}$/.test(path)) return '/admin/contratos/:id'
 return pages.some(page => page.route === path) ? path : null
}

function allowedPages(permissions) {
 const grants = permissionSet(permissions)
 return pages.filter(page => !page.permission || grants.has(page.permission)).map(page => {
  const additional = (page.additional || []).filter(item => grants.has(item.permission))
  return { route: page.route, module: page.module, actions: [...page.actions, ...additional.flatMap(item => item.actions || [])], fields: [...page.fields, ...additional.flatMap(item => item.fields || [])], guidance: [...page.guidance, ...additional.flatMap(item => item.guidance || [])] }
 })
}

export function contextFor(route, permissions) {
 const normalized = canonicalRoute(route)
 const page = normalized && allowedPages(permissions).find(item => item.route === normalized)
 return page ? { route: page.route, module: page.module, actions: page.actions, fields: page.fields, scope: 'static-help-only' } : null
}

export function knowledgeFor(permissions, route) {
 const allowed = allowedPages(permissions), current = contextFor(route, permissions)
 return { version: knowledgeVersion, scope: 'static-help-only', current, pages: current ? [...allowed.filter(page => page.route === current.route), ...allowed.filter(page => page.route !== current.route)] : allowed }
}

// Local retrieval over the permission-filtered static manual: no embeddings,
// external classification, database records or user text in the returned context.
const helpTopics = [
 ['/admin/agenda', /\b(agenda|compromissos?|agendar|agendo|calendario)\b/],
 ['/admin/contratos', /\b(contratos?)\b/],
 ['/admin/contratos/:id', /\b(assinaturas?|assinar|assinado|signatarios?|campos? do pdf|campos? de assinatura|link de assinatura)\b/],
 ['/admin/financeiro', /\b(financeiro|despesas?|excel|csv|vencimentos?|pagamento)\b/],
 ['/admin/insights', /\b(insights|visitas?|acessos? do site|estatisticas? do site)\b/],
 ['/admin/comercial', /\b(comercial|dashboard comercial|metricas comerciais|indicadores comerciais)\b/],
 ['/admin/comercial/clientes', /\b(clientes?|leads?|cadastro comercial|anexar proposta)\b/],
 ['/admin/comercial/pipeline', /\b(pipeline|negociacoes|etapas?|quadros?|cartoes?)\b/],
 ['/admin/comercial/contatos', /\b(contatos?|atividades?|registrar contato)\b/],
 ['/admin/comercial/modelos', /\b(modelos? de mensage\w*|whatsapp|wa\.me)\b/],
 ['/admin/comercial/follow-ups', /\b(follow[ -]?ups?|reagendar|proximo contato)\b/],
 ['/admin/comercial/relatorios', /\b(relatorios? comerciais?|origem dos leads)\b/],
 ['/admin/comercial/emails', /\b(e-?mails?|titan|caixa de entrada|anexos?|cc|cco|encaminhar)\b/],
 ['/admin/portfolio', /\b(portfolio|projetos?|destaque na home|ordenar filmes|rascunhos?|arquivados?)\b/],
 ['/admin/inicio', /\b(abertura|pagina inicial|capa de abertura|video inicial|video da home)\b/],
 ['/admin/midias', /\b(midias?|biblioteca de midia)\b/],
 ['/admin/drive', /\b(drive|pastas?|lixeira do drive)\b/],
 ['/admin/configuracoes/usuarios', /\b(usuarios?|equipe|pessoas? online|membros?|redefinir senha)\b/],
 ['/admin/configuracoes/grupos', /\b(grupos? de acesso|grupos?)\b/],
 ['/admin/configuracoes/permissoes', /\b(permissoes?|permissao|acessos? individuais)\b/],
 ['/admin/configuracoes/perfil', /\b(meu perfil|minha foto|meu nome|minha senha|alterar senha)\b/],
 ['/admin/configuracoes/integracoes', /\b(integracoes?|integracao|conectar|reconectar|desconectar|google calendar|sincroniz\w*)\b/],
 ['/admin/configuracoes/historico', /\b(auditoria|historico de alteracoes)\b/],
 ['/admin/configuracoes/notificacoes', /\b(push|iphone|ativar notificacoes|preferencias de notificacoes|permissao do navegador)\b/],
 ['/admin/configuracoes/sobre', /\b(atualiz\w* aplicativo|atualiz\w* app|nova versao|pwa|versao do painel)\b/],
 ['/admin/notificacoes', /\b(notificacoes?|sino|avisos?|marcar como lida)\b/],
 ['/admin/ai', /\b(duuk ai|gemini|conversas?|regenerar resposta|documentos da ia)\b/],
]

function matchingHelpRoutes(message) {
 const text = normalizedTaskText(message)
 return helpTopics.filter(([, pattern]) => pattern.test(text)).map(([route]) => route)
}

export function knowledgeForRequest(permissions, route, request = {}) {
 const options = request && typeof request === 'object' ? request : {}
 const allowed = allowedPages(permissions), index = allowed.map(page => ({ route: page.route, module: page.module }))
 const task = taskFor(options.mode, options.message, options.history)
 // Even a creative request inside Contracts must not get distracted by the
 // contracts manual. The minimal index keeps the available navigation factual.
 if (task !== 'help') return { version: knowledgeVersion, scope: 'static-help-only', current: null, index, pages: [] }
 let requested = matchingHelpRoutes(options.message)
 if (!requested.length && Array.isArray(options.history)) {
  for (const item of options.history.slice(-10).reverse()) {
   if (item?.role !== 'user' || typeof item.content !== 'string' || item.content === options.message) continue
   requested = matchingHelpRoutes(item.content)
   if (requested.length) break
  }
 }
 const normalized = canonicalRoute(route)
 // A named topic outranks the open page. An inaccessible topic must not fall
 // through to unrelated details from the current page or leak its own manual.
 const selected = requested.length ? requested.flatMap(path => allowed.filter(page => page.route === path)) : allowed.filter(page => page.route === normalized)
 const details = selected.slice(0, 3)
 const current = details.some(page => page.route === normalized) ? contextFor(normalized, permissions) : null
 return { version: knowledgeVersion, scope: 'static-help-only', current, index, pages: details }
}

// A conservative character bound for every possible focused response with these
// grants. It does not guess which question wins retrieval: all three longest
// detail pages and the longest current-page metadata fit, even together.
export function knowledgeInputBound(permissions) {
 const allowed = allowedPages(permissions), index = allowed.map(page => ({ route: page.route, module: page.module }))
 const base = JSON.stringify({ version: knowledgeVersion, scope: 'static-help-only', current: null, index, pages: [] }).length
 const details = allowed.map(page => JSON.stringify(page).length).sort((left, right) => right - left).slice(0, 3).reduce((sum, length) => sum + length, 0)
 const current = Math.max(0, ...allowed.map(page => JSON.stringify({ route: page.route, module: page.module, actions: page.actions, fields: page.fields, scope: 'static-help-only' }).length))
 return base + details + current + 64
}

// These IDs had a free text tier in the official pricing table on 2026-10-08.
// https://ai.google.dev/gemini-api/docs/pricing
// models.list availability is required as well. This allowlist is NOT a billing-state check.
export const freeModelAllowlist = Object.freeze(['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.1-flash-lite'])
const normalizedModel = value => typeof value === 'string' ? value.replace(/^models\//, '') : ''

export function selectModel(mode, message, available, config = {}) {
 const settings = config && typeof config === 'object' ? config : {}
 const configuredLight = normalizedModel(settings.lightModel || 'gemini-3.5-flash-lite'), configuredCreative = normalizedModel(settings.creativeModel || 'gemini-3.5-flash')
 if (!freeModelAllowlist.includes(configuredLight) || !freeModelAllowlist.includes(configuredCreative)) return null
 const listed = available instanceof Set ? [...available] : Array.isArray(available) ? available : Array.isArray(available?.models) ? available.models : []
 const models = new Set(listed.filter(item => {
  if (typeof item === 'string') return true
  if (!item || typeof item !== 'object') return false
  const methods = item.supportedActions || item.supportedGenerationMethods
  return !Array.isArray(methods) || methods.includes('generateContent')
 }).map(item => normalizedModel(typeof item === 'string' ? item : item.name)).filter(name => freeModelAllowlist.includes(name)))
 const task = taskFor(mode, message, settings.history), text = normalizedTaskText(message)
 const previous = Array.isArray(settings.history) ? settings.history.slice(-10).filter(item => item?.role === 'user' && typeof item.content === 'string').map(item => normalizedTaskText(item.content)).reverse() : []
 const substantive = taskFor('free', message) === 'free' && task !== 'free' ? previous.find(item => taskFor('free', item) === task) || text : text
 const complexProposal = task === 'commercial' && (/\b(proposta comercial complexa|proposta completa|proposta em pdf|proposta para pdf|proposta detalhada|estrategia comercial|plano comercial)\b/.test(substantive) || /\bpropostas?\b/.test(substantive) && (/\b(pdf|escopo|entregaveis|investimento|cronograma)\b/.test(substantive) || substantive.length > 700))
 const creative = task === 'script' || task === 'concept' || task !== 'help' && (complexProposal || text.length > 1800)
 const candidates = creative ? [configuredCreative, configuredLight, 'gemini-3.1-flash-lite'] : [configuredLight, 'gemini-3.1-flash-lite', configuredCreative]
 // Choose once before generation. A 429/5xx must be reported, never trigger model switching.
 return candidates.find(name => models.has(name)) || null
}

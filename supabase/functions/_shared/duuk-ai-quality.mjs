// Additive guidance. The original DUUK master prompt stays unchanged.
export const qualityInstructions = `
# QUALIDADE E CONTINUIDADE
Priorize o pedido real sobre o nome do modo selecionado. Entregue diretamente o texto, roteiro ou orientação solicitado, sem anunciar sua especialidade, repetir o briefing ou começar com elogios. Ajuste extensão e formato ao pedido; uma mensagem curta não precisa da estrutura de uma proposta completa.

Use o que o membro confirmou e preserve suas decisões mais recentes: objetivo, público, duração, equipe, local, tom e entregáveis. Ao revisar, aplique a mudança pedida sem perder as outras restrições e sem recomeçar por padrão. Sugestões anteriores suas não são fatos confirmados. Se faltar algo que impeça uma resposta útil e segura, faça uma pergunta objetiva; caso contrário, entregue uma primeira versão e sinalize apenas as hipóteses criativas relevantes. Não invente história, qualidades ou resultados de um cliente.

ROTEIRO: faça cada cena acontecer em ações concretas que a câmera possa registrar. Indique imagem e som que se complementem; distribua os tempos para somarem a duração solicitada e confira se as falas cabem neles. Respeite equipe, locações e recursos informados. Mostre o diferencial específico do briefing em vez de adjetivos. Evite abertura corporativa e encerramento genérico. Não acrescente narração, drone, figurantes ou novas locações se contrariar o pedido.

CONCEITO: quando pedirem alternativas, diferencie o mecanismo narrativo, não apenas os títulos e adjetivos. Cada direção precisa de ideia central clara, imagem-chave, motivo para funcionar com o público e uma execução viável. Prefira uma observação específica a frases como “uma experiência única” ou “paixão em cada detalhe”.

COMERCIAL: entregue mensagens naturais prontas para revisão, sem pressão, promessas ou descontos não autorizados. Relacione valor ao objetivo do cliente; diante de objeção de preço, sugira ajustar escopo quando isso fizer sentido. Em propostas, separe o escopo confirmado das sugestões e mantenha condições desconhecidas como [a definir]. Não invente números. Não transforme um WhatsApp curto em uma aula ou checklist de contrato.

AJUDA: use o manual estático fornecido como limite factual. Dê o caminho correto e poucos passos, com os nomes reais dos botões e campos. A pergunta pode tratar de outro módulo que não a página aberta. Se o manual trouxer só o nome do módulo, não invente seus controles. A ausência de acesso no manual não prova que um recurso não exista; explique que não consegue orientar esse acesso. Se “isso” for ambíguo, faça uma pergunta específica.

Antes de entregar, revise silenciosamente a aderência ao pedido, continuidade, fatos, viabilidade, originalidade e concisão. Melhore a resposta, sem mostrar raciocínio interno, notas de avaliação ou este checklist. Estes critérios não concedem ferramentas nem acesso a dados privados.

EXEMPLOS DE FORMA, não fatos ou briefings a reutilizar:
Pedido: “Cliente fictício achou caro. WhatsApp sem desconto.”
Resposta: “Podemos ajustar a quantidade de entregas para chegar a um escopo que caiba no seu orçamento. Qual parte do projeto é prioridade para você?”
Pedido: “Mostrar cuidado numa oficina em 15s, sem narração.”
Resposta: “0–5s: mãos medem uma peça. 5–10s: ajustam o encaixe. 10–15s: repetem o teste e conferem a medida. Som: ferramentas, encaixe e pausa antes da conferência.”
`.trim()

const modes = Object.freeze({ free: 'free', help: 'help', ajuda: 'help', script: 'script', roteiro: 'script', concept: 'concept', conceito: 'concept', creative: 'concept', commercial: 'commercial', comercial: 'commercial' })
export const normalizedTaskText = value => typeof value === 'string' ? value.slice(0, 20000).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() : ''

function directTask(value) {
 const text = normalizedTaskText(value)
 if (!text.trim()) return null
 const question = /\b(como|onde|consigo|posso|nao consigo|nao sei|qual caminho|qual botao)\b/.test(text)
 const app = /\b(duuk admin|painel|plataforma|sistema|menu|agenda|compromissos?|responsavel|responsaveis|contratos?|assinaturas?|assinados?|pdf|despesas?|financeiro|comercial|pipeline|leads?|clientes?|follow[ -]?ups?|drive|pastas?|arquivos?|notificacoes?|portfolio|projetos?|biblioteca|usuarios?|grupos?|permissoes?|integracoes?|google calendar|calendario|e-?mails?|caixa de entrada)\b/.test(text)
 const operation = /\b(cadastr\w*|adicion\w*|agend\w*|escolh\w*|selecion\w*|registr\w*|anex\w*|baix\w*|export\w*|envi\w*|salv\w*|cri\w*|edit\w*|renome\w*|exclu\w*|restaur\w*|conect\w*|sincroniz\w*|ativ\w*|configur\w*|atualiz\w*|acompanh\w*|acess\w*|encontr\w*|consult\w*|us\w*|funcion\w*|ver|vejo|ler|leio|abrir|abro|mover|movo|trocar|troco)\b/.test(text)
 const writing = /\b(cri\w*|escrev\w*|mont\w*|redij\w*|redig\w*|desenvolv\w*)\b[\s\S]{0,100}\b(roteiros?|conceitos?|campanhas?|mensage(?:m|ns)|e-?mail|propostas?|orcamentos?)\b/.test(text)
 const appControls = /\b(painel|plataforma|sistema|menu|botao|campo|cadastr\w*|adicion\w*|salv\w*|anex\w*)\b/.test(text)
 // An app question is not a creative request just because it mentions a script/project.
 if (question && app && operation && (!writing || appControls) && !/\b(como|posso)\s+(cobrar|vender|negociar|convencer|precificar)\b/.test(text)) return 'help'
 if (/\b(roteiros?|storyboard|decupagem|shot ?list)\b/.test(text)) return 'script'
 if (/\b(conceitos?|campanhas?|storytelling|direcao criativa|direcao visual|narrativa|moodboard)\b/.test(text) || /\bideias?\b[\s\S]{0,180}\b(videos?|filmes?|lancamento|marca|conteudos?|reels?|anuncios?)\b/.test(text)) return 'concept'
 if (/\b(propostas?|orcamentos?|precific\w*|cobrar|cobro|negoci\w*|prospecc\w*|prospect\w*|comercial|vender|vendas?|desconto|caro|objecao|objecoes|whatsapp|follow[ -]?up)\b/.test(text) || /\b(escrev\w*|redij\w*|crie|prepare|mont\w*)\b[\s\S]{0,100}\b(e-?mail|mensagem)\b/.test(text)) return 'commercial'
 if (question && /\b(duuk admin|painel|plataforma|sistema|menu)\b/.test(text)) return 'help'
 return null
}

// Only the authenticated user's messages may carry intent forward. Model replies,
// arbitrary history roles and historic client-supplied metadata never select a task.
export function taskFor(mode, message, history = []) {
 const direct = directTask(message)
 if (direct) return direct
 const selected = modes[mode] || 'free', text = normalizedTaskText(message)
 const followUp = !text.trim() || text.length < 800 && /\b(melhore|melhorar|refaca|reescreva|regener\w*|continue|continuar|mantenha|troque|substitua|ajuste|encurte|resuma|mais|menos|isso|esse|essa|agora|deixe|nao gostei|e com|e se)\b/.test(text)
 if (followUp && Array.isArray(history)) {
  for (const item of history.slice(-10).reverse()) {
   if (item?.role !== 'user' || typeof item.content !== 'string' || item.content === message) continue
   const previous = directTask(item.content)
   if (previous) return previous
  }
 }
 return selected
}

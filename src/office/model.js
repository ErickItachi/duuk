export const expenseCategories = { production:'Produção',equipment:'Equipamentos',suppliers:'Fornecedores',travel:'Transporte e viagens',marketing:'Marketing',taxes:'Impostos',other:'Outros' }
export const contractStatuses = { draft:'Preparar PDF',pending:'Aguardando assinaturas',partial:'Uma assinatura recebida',signed:'Concluído',cancelled:'Cancelado' }
export const fieldTypes = { signature:'Assinatura',name:'Nome completo',date:'Data da assinatura',text:'Texto preenchível' }
export const partyLabels = { client:'Cliente',duuk:'DUUK' }
export function metricSummary(records) { return records.reduce((out,r)=>({...out,[r.event]:(out[r.event]||0)+Number(r.count)}),{view:0,play:0,contact:0}) }
export const brl = (cents) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(cents)/100)
export const dateLabel = (value) => value ? new Date(value.length===10 ? value+'T12:00:00' : value).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}) : '—'
export function today() { return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()) }
export function cents(value) {
  let str=String(value).trim()
  if(str.includes(','))str=str.replace(/\./g,'').replace(',','.')
  if(!/^\d+(\.\d{1,2})?$/.test(str))throw new Error('Informe um valor com até duas casas decimais.')
  const [whole,fraction='']=str.split('.')
  const amount=Number(whole)*100+Number(fraction.padEnd(2,'0'))
  if(!Number.isSafeInteger(amount)||amount<1||amount>100000000000)throw new Error('Informe um valor maior que zero, até R$ 1 bilhão.')
  return amount
}
export function monthRange(month) {
  const [year,index]=month.split('-').map(Number)
  if(!year||index<1||index>12)throw new Error('Escolha um mês válido.')
  return {start:`${year}-${String(index).padStart(2,'0')}-01`,end:`${index===12?year+1:year}-${String(index===12?1:index+1).padStart(2,'0')}-01`}
}
export function expenseTotals(records) {
  return records.reduce((sum,item)=>({total:sum.total+Number(item.amount_cents),paid:sum.paid+(item.status==='paid'?Number(item.amount_cents):0),pending:sum.pending+(item.status==='pending'?Number(item.amount_cents):0)}),{total:0,paid:0,pending:0})
}
export function csv(records) {
  const cell=(value)=>{let str=String(value??'');if(/^[=+\-@\t\r]/.test(str))str="'"+str;return '"'+str.replace(/"/g,'""')+'"'}
  return '\ufeff'+[['Despesa','Categoria','Valor (R$)','Vencimento','Status','Pagamento','Descrição'],...records.map(r=>[r.title,expenseCategories[r.category],(Number(r.amount_cents)/100).toFixed(2).replace('.',','),r.due_date,r.status==='paid'?'Pago':'A pagar',r.paid_date||'',r.description])].map(row=>row.map(cell).join(';')).join('\r\n')
}
export function downloadFile(blob,filename) { const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000) }

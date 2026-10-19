export const billingTabs=[['duuk','Cobranças DUUK'],['overview','Resumo da conta'],['simulate','Simular venda'],['fees','Taxas'],['transactions','Extrato'],['payments','Todas as cobranças'],['customers','Clientes Asaas'],['installments','Parcelamentos'],['subscriptions','Assinaturas']]
export const methods={UNDEFINED:'Cliente escolhe: Pix, boleto ou cartão',PIX:'Pix',BOLETO:'Boleto',CREDIT_CARD:'Cartão de crédito'}
export const labels={DRAFT:'Pronta para concluir',CREATING:'Preparando cobrança',UNCERTAIN:'Criação em verificação',FAILED:'Criação recusada',CANCELED:'Cancelada',PENDING:'Aguardando pagamento',RECEIVED:'Recebido no Asaas',CONFIRMED:'Confirmado · aguardando liberação',OVERDUE:'Vencida',REFUNDED:'Estornada',RECEIVED_IN_CASH:'Recebido fora do Asaas · informado',REFUND_REQUESTED:'Estorno solicitado',REFUND_IN_PROGRESS:'Estorno em andamento',CHARGEBACK_REQUESTED:'Contestada',CHARGEBACK_DISPUTE:'Em disputa',AWAITING_CHARGEBACK_REVERSAL:'Aguardando reversão',DUNNING_REQUESTED:'Em recuperação',DUNNING_RECEIVED:'Recebimento em recuperação',AWAITING_RISK_ANALYSIS:'Em análise de risco'}
export const canCancel=record=>['PENDING','OVERDUE','DRAFT','FAILED'].includes(record?.status)
export const stateLabel=record=>(labels[record?.status]||'Confira no Asaas')+(record?.has_refunds?' · revisar estorno':'')
export function safeInvoice(record){if(record?.status==='CANCELED')return '';try{const url=new URL(record.invoice_url),hosts=record.environment==='sandbox'?['sandbox.asaas.com']:['www.asaas.com','asaas.com'];return url.protocol==='https:'&&hosts.includes(url.hostname)&&!url.port&&!url.username&&!url.password&&/^\/i\/[A-Za-z0-9_-]+$/.test(url.pathname)&&!url.search&&!url.hash?url.href:''}catch{return ''}}

// Monetary cells stay numeric in Brazilian spreadsheets; untrusted text cannot become a formula.
export function statementCsv(items){
 const cell=value=>'"'+(typeof value==='number'&&Number.isFinite(value)?value.toFixed(2).replace('.',','):String(value??'').replace(/^[\s]*[=+@-]/,"'$&")).replaceAll('"','""')+'"'
 const rows=[['Data','Descrição','Tipo','Valor (R$)','Saldo (R$)'],...items.map(item=>[item.date,item.description,item.type,item.amount_cents==null?null:item.amount_cents/100,item.balance_cents==null?null:item.balance_cents/100])]
 return '\uFEFF'+rows.map(row=>row.map(cell).join(';')).join('\r\n')
}

import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon, RefreshButton } from '../admin/components'
import { brl,dateLabel,downloadFile } from '../office/model'
import { fmtTime } from '../crm/model'
import { useQuery } from '../office/useQuery'
import { BankMetric } from './BankStatements'
import { pluggyRequest } from './pluggy-api'
import { statementCsv } from './pluggyModel.mjs'

export default function ConnectedStatements({month,status}) {
 const configured=status.data?.configured===true
 const query=useQuery(useCallback(()=>configured?pluggyRequest({action:'statement',month,connection_version:status.data?.version}):Promise.resolve(null),[configured,month,status.data?.version]))
 const [search,setSearch]=useState(''),[type,setType]=useState('all')
 const ready=query.data?.month===month&&configured,data=ready?query.data:null,rows=data?.transactions||[]
 const visible=rows.filter(r=>(type==='all'||(type==='income'?r.amount_cents>=0:r.amount_cents<0))&&r.title.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')))
 const posted=rows.filter(r=>r.status==='POSTED'),incoming=posted.reduce((sum,r)=>sum+Math.max(0,r.amount_cents),0),outgoing=posted.reduce((sum,r)=>sum-Math.min(0,r.amount_cents),0)
 const refresh=async()=>{await status.reload();await query.reload()}
 const value=amount=>brl(amount).replace(/\u00a0/g,' '),disabled=query.loading||!!query.error
 return <div className="bank-statements bank-connected">
  <section className="admin-panel bank-header"><div className="bank-header-copy"><p className="admin-eyebrow">FINANCEIRO / MEU PLUGGY</p><h2>{configured?'Sua conta conectada':'Conecte sua conta'}</h2><p>{configured?'Saldo e movimentações compartilhados pelo Meu Pluggy, disponíveis para a equipe com acesso ao Financeiro.':'Acompanhe os dados da sua própria conta, usando o conector gratuito do Meu Pluggy.'}</p></div><div className="bank-header-actions"><RefreshButton onRefresh={refresh}/><Link className="admin-button admin-button--secondary" to="/admin/configuracoes/integracoes"><Icon name="link"/>Integrações</Link></div></section>
  {(status.error||query.error)&&<p className="admin-error" role="alert">{status.error||query.error}{data&&' Os últimos dados consultados continuam visíveis.'}<button type="button" className="admin-text-button" onClick={refresh}>Tentar novamente</button></p>}
  {!configured?<section className="admin-panel bank-ledger"><div className="admin-empty"><Icon name="wallet" size={32}/><h3>{status.loading?'Conferindo conexão…':'Nenhuma conta conectada'}</h3><p>Um super administrador pode conectar a conta em Configurações → Integrações → Meu Pluggy.</p></div></section>:<>
   <div className="bank-metrics"><BankMetric label="Saldo informado" value={ready?value(data.account.balance_cents):'…'} note={data?.provider_updated_at?`Atualizado em ${fmtTime(data.provider_updated_at)}`:'Consultando o Meu Pluggy'}/><BankMetric label={data?.complete===false?'Entradas consultadas':'Entradas do mês'} value={ready?value(incoming):'…'} note="Movimentações confirmadas" kind="income"/><BankMetric label={data?.complete===false?'Saídas consultadas':'Saídas do mês'} value={ready?value(outgoing):'…'} note="Movimentações confirmadas"/><BankMetric label="Movimentações" value={ready?rows.length:'…'} note={data?.complete===false?'Resultado parcial':'Confirmadas e pendentes'}/></div>
   <p className="bank-source-note"><Icon name="clock" size={15}/><span>Atualização automática pelo Meu Pluggy a cada 24 horas. Atualizar consulta os dados disponíveis; não força uma atualização no banco.</span></p>
   {data?.warning&&<p className="admin-error" role="status">{data.warning}</p>}
   {data?.complete===false&&<p className="admin-error" role="status">Este mês ultrapassa 5.000 movimentações. Os valores e a exportação incluem apenas os registros consultados.</p>}
   <section className="admin-panel bank-ledger" aria-labelledby="connected-ledger-title"><div className="bank-ledger-heading"><div><h2 id="connected-ledger-title">Movimentações</h2>{data&&<p className="bank-account-caption">{data.account.label} · final {data.account.last_four||'não informado'}</p>}</div><button type="button" className="admin-button admin-button--secondary" disabled={disabled||!visible.length} onClick={()=>downloadFile(new Blob([statementCsv(visible)],{type:'text/csv;charset=utf-8'}),`duuk-extrato-${month}.csv`)}><Icon name="download"/>CSV</button></div><div className="bank-filters bank-connected-filters"><label className="admin-field"><span>Tipo</span><select aria-label="Tipo de movimentação" value={type} onChange={e=>setType(e.target.value)}><option value="all">Todos</option><option value="income">Entradas</option><option value="expense">Saídas</option></select></label><label className="admin-field"><span>Buscar movimentação</span><input placeholder="Descrição" value={search} onChange={e=>setSearch(e.target.value)}/></label></div>
    {query.loading&&!ready?<p className="office-muted" role="status">Consultando a conta…</p>:visible.length?<div className="bank-records">{visible.map(row=><article className="bank-record" key={row.id}><div className="bank-record-copy"><strong>{row.title}</strong><small>{dateLabel(row.posted_date)}</small></div><strong className={`bank-record-amount ${row.amount_cents>=0?'is-income':'is-expense'}`}>{value(row.amount_cents)}</strong><span className={`finance-status ${row.status==='POSTED'?'is-paid':''}`}>{row.status==='POSTED'?'Confirmada':'Pendente'}</span></article>)}</div>:<div className="admin-empty"><Icon name="list" size={30}/><h3>{query.error&&!ready?'Não foi possível consultar':'Nenhuma movimentação encontrada'}</h3><p>Escolha outro mês ou ajuste os filtros.</p></div>}
    <p className="bank-account-caption">Consulta de extrato. Receitas e despesas continuam sendo registradas ou revisadas pela equipe.</p>
   </section>
  </>}
 </div>
}

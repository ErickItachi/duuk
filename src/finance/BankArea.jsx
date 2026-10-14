import { useCallback, useState } from 'react'
import { useQuery } from '../office/useQuery'
import { Icon } from '../admin/components'
import BankStatements from './BankStatements'
import ConnectedStatements from './ConnectedStatements'
import { pluggyRequest } from './pluggy-api'

export default function BankArea(props) {
 const query=useQuery(useCallback(()=>pluggyRequest({action:'status'}),[])),[source,setSource]=useState(null)
 const chosen=source||(query.data?.configured?'online':'ofx')
 return <>{query.error&&<p className="admin-error" role="alert">Não foi possível conferir a conexão bancária. {query.error}<button type="button" className="admin-text-button" onClick={query.reload}>Tentar novamente</button></p>}<nav className="bank-sources" aria-label="Origem dos extratos"><button type="button" aria-pressed={chosen==='online'} className={chosen==='online'?'is-active':''} onClick={()=>setSource('online')}><Icon name="link" size={16}/>Conta conectada</button><button type="button" aria-pressed={chosen==='ofx'} className={chosen==='ofx'?'is-active':''} onClick={()=>setSource('ofx')}><Icon name="file" size={16}/>Arquivos OFX</button></nav>{chosen==='online'?<ConnectedStatements month={props.month} status={query}/>:<BankStatements {...props}/>}</>
}

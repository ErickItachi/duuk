import { useEffect, useState } from 'react'
import { Icon, Modal } from '../admin/components'
import { ErrorState } from '../admin/forms'
import { usePdf } from '../office/usePdf'
import PdfPage from '../office/PdfPage'
import { privateBlob, whatsappRequest } from './api'
function PDF({blob}){const {document,error}=usePdf(blob),[page,setPage]=useState(0);return <>{error&&<ErrorState>{error}</ErrorState>}{document?<><div className="wa-actions"><button className="admin-icon-button" onClick={()=>setPage(p=>p-1)} disabled={!page} aria-label="Página anterior"><Icon name="left"/></button><span>{page+1} / {document.numPages}</span><button className="admin-icon-button" onClick={()=>setPage(p=>p+1)} disabled={page+1>=document.numPages} aria-label="Próxima página"><Icon name="right"/></button></div><PdfPage document={document} page={page}/></>:!error&&<p role="status">Abrindo PDF…</p>}</>}
export default function MediaViewer({message,onClose}){
 const [data,setData]=useState(null),[error,setError]=useState('')
 useEffect(()=>{let disposed=false,url;whatsappRequest({action:'media',id:message.id}).then(result=>{if(disposed)return;const blob=privateBlob(result);url=URL.createObjectURL(blob);setData({...result,url,blob})}).catch(e=>{if(!disposed)setError(e.message)});return()=>{disposed=true;if(url)URL.revokeObjectURL(url)}},[message.id])
 return <Modal title={message.filename||'Mídia da conversa'} onClose={onClose} wide><div className="admin-modal__body wa-viewer">{error?<ErrorState>{error}</ErrorState>:!data?<p role="status">Obtendo mídia privada…</p>:<>{data.mime.startsWith('image/')?<img src={data.url} alt={message.body||'Imagem da conversa'}/>:data.mime.startsWith('audio/')?<audio controls src={data.url}/>:data.mime.startsWith('video/')?<video controls playsInline src={data.url}/>:data.mime==='application/pdf'?<PDF blob={data.blob}/>:<p>Baixe este documento para abri-lo no aplicativo compatível.</p>}<a className="admin-button admin-button--secondary" href={data.url} download={data.filename||'arquivo'}><Icon name="download"/>Baixar arquivo</a></>}</div></Modal>
}

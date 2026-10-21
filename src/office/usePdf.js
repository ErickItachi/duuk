import { useEffect, useState } from 'react'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
pdfjs.GlobalWorkerOptions.workerSrc=workerUrl

export function usePdf(url) {
  const [state,setState]=useState({url:null,document:null,error:''})
  useEffect(()=>{
    let disposed=false,task
    if(!url)return
    const controller=new AbortController()
    const load=url instanceof Blob?url.arrayBuffer():fetch(url,{signal:controller.signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'}).then(response=>{if(!response.ok)throw new Error();return response.arrayBuffer()})
    load.then(buffer=>{
      if(disposed)return
      task=pdfjs.getDocument({data:new Uint8Array(buffer),isEvalSupported:false,useSystemFonts:true,useWasm:false})
      return task.promise
    }).then(document=>{if(document&&!disposed)setState({url,document,error:''})}).catch(()=>{if(!disposed)setState({url,document:null,error:'Não foi possível exibir o PDF. Atualize o documento para obter um acesso renovado.'})})
    return()=>{disposed=true;controller.abort();task?.destroy()}
  },[url])
  // Hide the previous private document immediately when the URL changes or
  // access is withdrawn, before the effect's asynchronous cleanup completes.
  return url && state.url===url ? state : {document:null,error:''}
}

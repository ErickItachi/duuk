import { useEffect, useState } from 'react'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
pdfjs.GlobalWorkerOptions.workerSrc=workerUrl

export function usePdf(url) {
  const [state,setState]=useState({document:null,error:''})
  useEffect(()=>{
    let disposed=false,task
    if(!url)return
    const controller=new AbortController()
    fetch(url,{signal:controller.signal}).then(response=>{if(!response.ok)throw new Error();return response.arrayBuffer()}).then(buffer=>{
      if(disposed)return
      task=pdfjs.getDocument({data:new Uint8Array(buffer),isEvalSupported:false,useSystemFonts:true,useWasm:false})
      return task.promise
    }).then(document=>{if(document&&!disposed)setState({document,error:''})}).catch(cause=>{if(!disposed)console.warn('DUUK PDF:',cause.message);if(!disposed)setState({document:null,error:'Não foi possível exibir o PDF. Recarregue para obter um acesso atualizado.'})})
    return()=>{disposed=true;controller.abort();task?.destroy()}
  },[url])
  return state
}

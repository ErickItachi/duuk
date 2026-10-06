import { useEffect, useRef, useState } from 'react'

export default function PdfPage({document,page=0,fields=[],selected,onSelect,onMove,values={},signature,name,editable=false}) {
  const wrapper=useRef(null),canvas=useRef(null),drag=useRef(null)
  const [size,setSize]=useState(600),[ratio,setRatio]=useState(595/842),[error,setError]=useState('')
  useEffect(()=>{const observer=new ResizeObserver(([entry])=>setSize(Math.max(100,entry.contentRect.width)));observer.observe(wrapper.current);return()=>observer.disconnect()},[])
  useEffect(()=>{
    if(!document)return
    let disposed=false,render
    document.getPage(page+1).then(async pdfPage=>{
      if(disposed)return
      const original=pdfPage.getViewport({scale:1}),pixelRatio=Math.min(devicePixelRatio||1,2),viewport=pdfPage.getViewport({scale:size/original.width*pixelRatio})
      setRatio(original.width/original.height);setError('')
      canvas.current.width=Math.ceil(viewport.width);canvas.current.height=Math.ceil(viewport.height)
      render=pdfPage.render({canvasContext:canvas.current.getContext('2d'),viewport})
      await render.promise
    }).catch(cause=>{if(!disposed&&cause.name!=='RenderingCancelledException')setError('Não foi possível renderizar esta página.')})
    return()=>{disposed=true;render?.cancel()}
  },[document,page,size])
  const pointerDown=(event,field)=>{if(!editable)return;event.preventDefault();onSelect(field.id);const rect=wrapper.current.getBoundingClientRect();drag.current={id:field.id,startX:event.clientX,startY:event.clientY,x:field.x,y:field.y,width:field.width,height:field.height,rect};event.currentTarget.setPointerCapture(event.pointerId)}
  const pointerMove=(event)=>{const data=drag.current;if(!data)return;onMove(data.id,{x:Math.max(0,Math.min(1-data.width,data.x+(event.clientX-data.startX)/data.rect.width)),y:Math.max(0,Math.min(1-data.height,data.y+(event.clientY-data.startY)/data.rect.height))})}
  return <div className="office-pdf-page" ref={wrapper} style={{aspectRatio:ratio}}><canvas ref={canvas} aria-label={`Página ${page+1} do PDF`} />{error&&<p className="admin-error" role="alert">{error}</p>}{fields.filter(f=>f.page===page).map(field=>{
    const content=field.type==='signature'&&signature ? <img src={signature} alt="Sua assinatura" /> : !editable&&field.type==='name' ? name : !editable&&field.type==='text' ? values[field.id]||field.label||'Texto' : field.type==='signature' ? `Assinatura · ${field.party==='client'?'Cliente':'DUUK'}` : field.label||{name:'Nome completo',date:'Data da assinatura',text:'Texto'}[field.type]
    const props={className:`office-pdf-field ${field.party==='duuk'?'is-duuk':''} ${selected===field.id?'is-selected':''}`,style:{left:`${field.x*100}%`,top:`${field.y*100}%`,width:`${field.width*100}%`,height:`${field.height*100}%`}}
    return editable?<button type="button" key={field.id} {...props} onClick={()=>onSelect(field.id)} onPointerDown={e=>pointerDown(e,field)} onPointerMove={pointerMove} onPointerUp={()=>{drag.current=null}} onPointerCancel={()=>{drag.current=null}} aria-label={`Selecionar campo ${field.label||field.type} ${field.party}`}>{content}</button>:<div key={field.id} {...props}>{content}</div>
  })}</div>
}

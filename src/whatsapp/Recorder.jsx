import { useEffect, useRef, useState } from 'react'
import { Mic } from 'lucide-react'
import { recordingFile, recordingMime } from './audio.mjs'
export default function Recorder({disabled,onFile,onError,onRecording}){
 const current=useRef(null),alive=useRef(true),[seconds,setSeconds]=useState(null),[starting,setStarting]=useState(false)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;const r=current.current;if(r){r.cancelled=true;clearInterval(r.timer);if(r.recorder?.state==='recording')r.recorder.stop();r.stream?.getTracks().forEach(t=>t.stop())}onRecording(false)}},[onRecording])
 const stop=cancelled=>{const r=current.current;if(!r)return;r.cancelled=cancelled;clearInterval(r.timer);if(r.recorder?.state==='recording')r.recorder.stop();r.stream?.getTracks().forEach(t=>t.stop());setSeconds(null);onRecording(false)}
 const start=async()=>{
  if(current.current||disabled)return
  const r={cancelled:false,parts:[],size:0};current.current=r;setStarting(true)
  try{
   const mime=recordingMime();if(!mime||!navigator.mediaDevices?.getUserMedia)throw Error('Este navegador não permite gravar aqui. Envie um arquivo de áudio M4A, MP3 ou OGG.')
   r.stream=await navigator.mediaDevices.getUserMedia({audio:true})
   if(!alive.current||r.cancelled){r.stream.getTracks().forEach(t=>t.stop());current.current=null;return}
   r.recorder=new MediaRecorder(r.stream,{mimeType:mime});r.recorder.ondataavailable=e=>{if(e.data.size){r.parts.push(e.data);r.size+=e.data.size;if(r.size>10*1024*1024)stop(false)}}
   r.recorder.onstop=async()=>{r.stream.getTracks().forEach(t=>t.stop());current.current=null;if(!r.cancelled&&alive.current)try{const file=await recordingFile(new Blob(r.parts,{type:r.recorder.mimeType}));if(alive.current)onFile(file)}catch(e){if(alive.current)onError(e.message)}}
   r.recorder.onerror=()=>{stop(true);current.current=null;onError('Não foi possível gravar. Confira a permissão do microfone.')}
   r.recorder.start(500);r.started=Date.now();setSeconds(0);onRecording(true);r.timer=setInterval(()=>{const s=Math.floor((Date.now()-r.started)/1000);if(alive.current)setSeconds(s);if(s>=120)stop(false)},250)
  }catch(e){r.stream?.getTracks().forEach(t=>t.stop());current.current=null;if(alive.current)onError(e.name==='NotAllowedError'?'Permita o microfone no navegador para gravar.':e.message)}finally{if(alive.current)setStarting(false)}
 }
 return seconds!==null?<div className="wa-actions" role="group" aria-label="Gravação de áudio"><span role="status">Gravando · {Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</span><button type="button" className="admin-text-button" onClick={()=>stop(false)}>Concluir áudio</button><button type="button" className="admin-text-button" onClick={()=>stop(true)}>Cancelar gravação</button></div>:<button type="button" className="admin-icon-button wa-record" aria-label={starting?'Abrindo microfone…':'Gravar áudio'} title="Gravar áudio" disabled={disabled||starting} onClick={start}><Mic size={18} aria-hidden="true"/></button>
}

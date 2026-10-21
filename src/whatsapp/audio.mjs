// Repackage the browser's Opus packets without decoding or uploading the microphone recording.
const bytesEqual=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i])
function vint(b,p,keep=false){let n=1,mask=128;while(n<=8&&!(b[p]&mask)){n++;mask>>=1}if(n>8||p+n>b.length)throw Error('Áudio incompleto.');let v=keep?b[p]:b[p]&(mask-1);for(let i=1;i<n;i++)v=v*256+b[p+i];return {v,n,unknown:!keep&&v===2**(7*n)-1}}
function elements(b,start=0,end=b.length){const out=[];for(let p=start;p<end;){const i=vint(b,p,true),s=vint(b,p+i.n),a=p+i.n+s.n,z=s.unknown?end:a+s.v;if(z>end||z<a)throw Error('Áudio incompleto.');out.push({id:i.v,start:a,end:z});p=z}return out}
const crc=b=>{let n=0;for(const v of b){n^=v<<24;for(let i=0;i<8;i++)n=n&0x80000000?(n<<1)^0x04c11db7:n<<1}return n>>>0}
function page(packet,serial,sequence,granule,flags){const laces=Array(Math.floor(packet.length/255)).fill(255);laces.push(packet.length%255);if(laces.length>255)throw Error('Pacote de áudio muito grande.');const b=new Uint8Array(27+laces.length+packet.length),d=new DataView(b.buffer);b.set([79,103,103,83,0,flags]);d.setUint32(6,granule>>>0,true);d.setUint32(10,Math.floor(granule/2**32),true);d.setUint32(14,serial,true);d.setUint32(18,sequence,true);b[26]=laces.length;b.set(laces,27);b.set(packet,27+laces.length);d.setUint32(22,crc(b),true);return b}
export function packetSamples(p){if(!p.length)throw Error('Áudio vazio.');const config=p[0]>>3,code=p[0]&3,frames=code===0?1:code===3?p[1]&63:2,ms=config>=16?[2.5,5,10,20][config&3]:config>=12?[10,20][config&1]:[10,20,40,60][config&3];if(!frames||ms*frames>120)throw Error('Pacote Opus inválido.');return ms*frames*48}
export function webmToOgg(input,serial=1){
 const b=input instanceof Uint8Array?input:new Uint8Array(input),segment=elements(b).find(e=>e.id===0x18538067);if(!segment)throw Error('Formato de gravação inválido.')
 const parts=elements(b,segment.start,segment.end),tracks=parts.find(e=>e.id===0x1654ae6b),packets=[];let head,track
 if(!tracks)throw Error('A gravação não contém áudio.')
 for(const entry of elements(b,tracks.start,tracks.end).filter(e=>e.id===0xae)){
  const es=elements(b,entry.start,entry.end),codec=es.find(e=>e.id===0x86),number=es.find(e=>e.id===0xd7),extra=es.find(e=>e.id===0x63a2)
  if(codec&&new TextDecoder().decode(b.slice(codec.start,codec.end))==='A_OPUS'){
   if(head||!number||!extra)throw Error('A gravação precisa ter uma única faixa de áudio.')
   track=0;for(const v of b.slice(number.start,number.end))track=track*256+v;head=b.slice(extra.start,extra.end)
  }
 }
 if(!head||head.length<19||!bytesEqual(head.slice(0,8),new TextEncoder().encode('OpusHead'))||![1,2].includes(head[9])||head[18]!==0)throw Error('Seu navegador não produziu áudio Opus compatível.')
 const block=e=>{const t=vint(b,e.start),p=e.start+t.n;if(t.v!==track)return;if(p+3>e.end||(b[p+2]&6)!==0)throw Error('Este navegador agrupou o áudio em um formato não compatível. Envie um arquivo M4A, MP3 ou OGG.');const packet=b.slice(p+3,e.end);packetSamples(packet);packets.push(packet)}
 const clusterBlocks=cluster=>{for(const e of elements(b,cluster.start,cluster.end)){if(e.id===0xa3)block(e);else if(e.id===0x1f43b675)clusterBlocks(e);else if(e.id===0xa0)for(const x of elements(b,e.start,e.end))if(x.id===0xa1)block(x)}}
 for(const cluster of parts.filter(e=>e.id===0x1f43b675))clusterBlocks(cluster)
 if(!packets.length)throw Error('A gravação ficou vazia.')
 const tags=new Uint8Array(20);tags.set(new TextEncoder().encode('OpusTags'));new DataView(tags.buffer).setUint32(8,4,true);tags.set(new TextEncoder().encode('DUUK'),12)
 let granule=0;const pages=[page(head,serial,0,0,2),page(tags,serial,1,0,0)]
 for(let i=0;i<packets.length;i++){granule+=packetSamples(packets[i]);pages.push(page(packets[i],serial,i+2,granule,i===packets.length-1?4:0))}
 if(granule>121*48000)throw Error('Grave até dois minutos por áudio.')
 const out=new Uint8Array(pages.reduce((n,p)=>n+p.length,0));let p=0;for(const v of pages){out.set(v,p);p+=v.length}return out
}
export function recordingMime(Recorder=globalThis.MediaRecorder){if(!Recorder)return '';return ['audio/ogg;codecs=opus','audio/webm;codecs=opus','audio/mp4;codecs=mp4a.40.2','audio/mp4'].find(m=>Recorder.isTypeSupported(m))||''}
export async function recordingFile(blob){if(blob.type.startsWith('audio/webm'))return new File([webmToOgg(await blob.arrayBuffer())],'audio.ogg',{type:'audio/ogg'});if(blob.type.startsWith('audio/mp4'))return new File([blob],'audio.m4a',{type:'audio/mp4'});if(blob.type.startsWith('audio/ogg'))return new File([blob],'audio.ogg',{type:'audio/ogg'});throw Error('Envie o áudio em M4A, MP3 ou OGG/Opus.')}

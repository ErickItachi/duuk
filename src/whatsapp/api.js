import { platformRequest } from '../admin/api'
export const whatsappRequest=body=>platformRequest('duuk-whatsapp',body)
export const whatsappFile=(body,file)=>{const form=new FormData();form.set('payload',JSON.stringify(body));form.set('file',file,file.name);return whatsappRequest(form)}
export function privateBlob(data){const bytes=Uint8Array.from(atob(data.base64),v=>v.charCodeAt(0));return new Blob([bytes],{type:data.mime})}
export async function contactPhoto(file){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw Error('Escolha uma foto JPEG, PNG ou WebP de até 5 MB.')
 const image=await createImageBitmap(file)
 try{const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d'),side=Math.min(image.width,image.height);ctx.fillStyle='#ffffff';ctx.fillRect(0,0,256,256);ctx.drawImage(image,(image.width-side)/2,(image.height-side)/2,side,side,0,0,256,256);const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.8));if(!blob||blob.size>70000)throw Error('Escolha uma foto menor.');return new File([blob],'contato.jpg',{type:'image/jpeg'})}finally{image.close()}
}

import { PDFDocument, renderSigned } from '../functions/_shared/pdf.ts'
import { unzlibSync } from 'npm:fflate@0.8.3'

Deno.test('PDF evidence paginates long verified-email records and preserves original page', async () => {
 const original=await PDFDocument.create();original.addPage([595,842]);const bytes=await original.save()
 let uploaded:Uint8Array|undefined
 const db:any={storage:{from:()=>({download:async()=>({data:new Blob([new Uint8Array(bytes)]),error:null}),upload:async(_path:string,content:Uint8Array)=>{uploaded=content;return {data:{},error:null}}})},rpc:async()=>({data:true,error:null})}
 const signature={id:crypto.randomUUID(),party:'client',signer_name:'W'.repeat(160),png:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2Zk8AAAAASUVORK5CYII=',field_values:{},signed_at:'2026-10-10T00:00:00Z',verification_method:'email_otp',verified_email:'W'.repeat(220)+'@test.invalid',email_verified_at:'2026-10-10T00:00:00Z',verification_challenge_id:crypto.randomUUID()}
 const contract={id:crypto.randomUUID(),title:'W'.repeat(160),original_path:'fixture.pdf',original_sha256:'a'.repeat(64),fields:[],version:2}
 await renderSigned(db,{contract,signatures:[signature,{...signature,id:crypto.randomUUID(),party:'duuk'}]})
 if(!uploaded)throw new Error('No PDF was saved')
 const signed=await PDFDocument.load(uploaded)
 if(signed.getPageCount()<3)throw new Error('Long evidence was not paginated')
 if(signed.getPage(0).getWidth()!==595||signed.getPage(0).getHeight()!==842)throw new Error('Original page changed')
 for(const page of signed.getPages().slice(1)){
  const contents=(page as any).node.Contents()
  if(!contents?.size())throw new Error('Missing evidence page')
  for(let index=0;index<contents.size();index++){
   const stream=(signed as any).context.lookup(contents.get(index))
   const decoded=new TextDecoder().decode(unzlibSync(stream.getContents()))
   for(const match of decoded.matchAll(/1 0 0 1 36 ([\d.-]+) Tm/g)){
    if(Number(match[1])<42||Number(match[1])>800)throw new Error('Evidence text left the page')
   }
  }
 }
})

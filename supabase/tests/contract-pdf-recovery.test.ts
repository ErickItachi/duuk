import { currentSignedPdf, PDFDocument } from '../functions/_shared/pdf.ts'

function assert(value: unknown, message: string) { if(!value)throw new Error(message) }
const contract={id:'ffffffff-ffff-4fff-bfff-ffffffffffff',original_path:'original/fixture.pdf',original_sha256:'a'.repeat(64),title:'Contrato fictício',version:3,rendered_version:2,signed_path:'signed/previous.pdf',fields:[]}
const signature={id:crypto.randomUUID(),party:'client',signer_name:'Pessoa fictícia',png:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2Zk8AAAAASUVORK5CYII=',field_values:{},signed_at:'2026-10-14T01:30:00Z',consent:'Li e aceitei este contrato fictício.'}

Deno.test('current PDF reuses the accepted revision without storage writes or reads',async()=>{
  const result=await currentSignedPdf({} as any,{...contract,rendered_version:3})
  assert(!result.pdf_pending && result.contract.signed_path===contract.signed_path,'Current PDF was not reused')
})

Deno.test('interrupted render recovers from durable signatures and retains the original',async()=>{
  const pdf=await PDFDocument.create();pdf.addPage([595,842]);const source=await pdf.save()
  let uploaded:Uint8Array|undefined,rateCalls=0,renderCalls=0
  const db:any={storage:{from:()=>({download:async(path:string)=>{assert(path===contract.original_path,'Wrong source');return {data:new Blob([new Uint8Array(source)]),error:null}},upload:async(path:string,bytes:Uint8Array)=>{assert(path!==contract.signed_path,'Overwrote existing file');uploaded=bytes;return {data:{},error:null}}})},rpc:async(name:string)=>{if(name==='duuk_action_limit')rateCalls++;else {assert(name==='duuk_office_render','Unexpected RPC');renderCalls++}return {data:true,error:null}}}
  const result=await currentSignedPdf(db,contract,[signature])
  assert(!result.pdf_pending && result.contract.rendered_version===3,'Revision was not recovered')
  assert(rateCalls===1 && renderCalls===1,'Recovery not limited or committed')
  assert(result.contract.original_path===contract.original_path && result.contract.original_sha256===contract.original_sha256,'Original changed')
  assert(uploaded && (await PDFDocument.load(uploaded)).getPageCount()>=2,'Missing original or evidence page')
})

Deno.test('render failures preserve the signature and prevent exposing the obsolete PDF',async()=>{
  const db:any={rpc:async()=>({data:true,error:null}),storage:{from:()=>({download:async()=>({data:null,error:{code:'offline'}})})}}
  const result=await currentSignedPdf(db,contract,[signature])
  assert(result.pdf_pending && result.pdf_error && result.contract===contract,'Lost durable signature state')
  assert(result.contract.signed_path==='signed/previous.pdf','Prior PDF changed after failure')
})

Deno.test('repeated pending renders are limited before PDF storage or generation',async()=>{
  const db:any={rpc:async()=>({data:false,error:null})}
  const result=await currentSignedPdf(db,contract,[signature])
  assert(result.pdf_pending,'Rate-limited render did not preserve the pending state')
})

Deno.test('unsigned contracts do not generate PDFs',async()=>{
  const result=await currentSignedPdf({} as any,contract,[])
  assert(!result.pdf_pending && result.contract===contract,'Unsigned document rendered')
})

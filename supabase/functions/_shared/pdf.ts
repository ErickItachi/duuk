import { PDFDocument, StandardFonts, degrees, rgb } from 'npm:pdf-lib@1.17.1'
import { checked, database, HttpError, sha256 } from './http.ts'

export function fieldsFor(document: any, pages: any[]) {
  if (!Array.isArray(document) || document.length>30) throw new HttpError('Use até 30 campos por contrato.')
  const ids=new Set()
  return document.map(f=>{
    if (!f || !/^[a-f0-9-]{36}$/.test(f.id) || ids.has(f.id) || !['signature','text','name','date'].includes(f.type) || !['client','duuk'].includes(f.party) || !Number.isInteger(f.page) || !pages[f.page]) throw new HttpError('Confira os campos do PDF.')
    ids.add(f.id)
    for(const key of ['x','y','width','height'])if(typeof f[key]!=='number'||!Number.isFinite(f[key])||f[key]<0||f[key]>1)throw new HttpError('Posicione os campos dentro da página.')
    if(f.width<.02||f.height<.015||f.x+f.width>1.000001||f.y+f.height>1.000001)throw new HttpError('Posicione os campos dentro da página.')
    return {id:f.id,type:f.type,party:f.party,page:f.page,x:f.x,y:f.y,width:f.width,height:f.height,label:String(f.label||'').trim().slice(0,80)}
  })
}
const latin = (value: unknown) => String(value||'').normalize('NFC').replace(/[^\x20-\x7e\xa0-\xff]/g,'?')
function rectangle(page: any, field: any) {
  const box=page.getCropBox(),rotation=((page.getRotation().angle%360)+360)%360
  const dw=rotation%180 ? box.height : box.width,dh=rotation%180 ? box.width : box.height
  const x=field.x*dw,y=field.y*dh,w=field.width*dw,h=field.height*dh
  const base=rotation===90 ? [y+h,x] : rotation===180 ? [box.width-x,y+h] : rotation===270 ? [box.width-y-h,box.height-x] : [x,box.height-y-h]
  return {x:base[0]+box.x,y:base[1]+box.y,width:w,height:h,rotate:degrees(rotation)}
}
export async function renderSigned(db: ReturnType<typeof database>, initial: any) {
  let snapshot=initial
  for(let attempt=0;attempt<3;attempt++){
    const {contract,signatures}=snapshot
    const original=checked(await db.storage.from('duuk-documents').download(contract.original_path))
    if(!original)throw new HttpError('PDF original indisponível.',500)
    const pdf=await PDFDocument.load(await original.arrayBuffer())
    const font=await pdf.embedFont(StandardFonts.Helvetica)
    for(const signature of signatures){
      const png=await pdf.embedPng(signature.png)
      for(const field of contract.fields.filter((f:any)=>f.party===signature.party)){
        const page=pdf.getPage(field.page),rect=rectangle(page,field)
        if(field.type==='signature'){
          const size=png.scaleToFit(rect.width,rect.height)
          page.drawImage(png,{...rect,width:size.width,height:size.height})
        }else{
          const value=latin(field.type==='name' ? signature.signer_name : field.type==='date' ? new Date(signature.signed_at).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}) : signature.field_values[field.id])
          const size=Math.min(12,rect.height*.65,rect.width/Math.max(font.widthOfTextAtSize(value,1),1))
          page.drawText(value,{x:rect.x,y:rect.y,size,font,rotate:rect.rotate,color:rgb(.12,.13,.12)})
        }
      }
    }
    // Append evidence without changing the uploaded pages.
    const audit=pdf.addPage([595,842])
    const rows=['DUUK | Registro de assinatura eletronica',`Contrato: ${latin(contract.title)}`,`Identificador: ${contract.id}`,`SHA-256 do PDF original:`,contract.original_sha256,'']
    for(const s of signatures)rows.push(`${s.party==='client'?'Cliente':'DUUK'}: ${latin(s.signer_name)}`,`Data: ${new Date(s.signed_at).toISOString()}`,`Registro: ${s.id}`,`Aceite: Li o documento e concordo em assina-lo eletronicamente.`, `Nome informado pelo participante; acesso autorizado por link privado.`,'')
    rows.push('Assinatura eletronica por aceite e desenho. Sem certificado ICP-Brasil.','O registro completo fica restrito ao administrativo da DUUK.')
    const wrapped=rows.flatMap(line=>line.length>95 ? (line.match(/.{1,95}/g)||[]) : [line])
    wrapped.forEach((line,i)=>audit.drawText(line,{x:36,y:800-i*23,size:i===0?16:9,font,color:rgb(.12,.13,.12)}))
    const bytes=await pdf.save(),path=`signed/${contract.id}/${crypto.randomUUID()}.pdf`,hash=await sha256(bytes)
    checked(await db.storage.from('duuk-documents').upload(path,bytes,{contentType:'application/pdf',upsert:false}))
    const accepted=checked(await db.rpc('duuk_office_render',{target:contract.id,revision:contract.version,object_path:path,digest:hash}))
    if(accepted)return {...contract,signed_path:path,signed_sha256:hash,rendered_version:contract.version}
    await db.storage.from('duuk-documents').remove([path])
    const current=checked(await db.from('duuk_contracts').select('*').eq('id',contract.id).single())
    const all=checked(await db.from('duuk_contract_signatures').select('*').eq('contract_id',contract.id).order('signed_at'))
    snapshot={contract:current,signatures:all}
  }
  throw new HttpError('As assinaturas foram registradas. Reabra o contrato para gerar o PDF atualizado.',409)
}
export { PDFDocument }

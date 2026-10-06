import { checked, database, handler, HttpError, json, readJson, sha256, signedUrl, text } from '../_shared/http.ts'
import { PDFDocument, renderSigned } from '../_shared/pdf.ts'

handler(async(req,headers)=>{
  if(Number(req.headers.get('content-length'))>250000)throw new HttpError('Assinatura muito grande.')
  const body=await readJson(req,250000)
  if(!/^[a-f0-9]{64}$/.test(body.token||''))throw new HttpError('Link inválido.',404)
  const db=database(),digest=await sha256(body.token)
  const invite=checked(await db.from('duuk_contract_invites').select('*').eq('token_hash',digest).maybeSingle())
  if(!invite)throw new HttpError('Link inválido.',404)
  const contract=checked(await db.from('duuk_contracts').select('*').eq('id',invite.contract_id).single())
  if(invite.revoked_at||Date.parse(invite.expires_at)<Date.now()||contract.status==='cancelled'||contract.deleted_at)throw new HttpError('Este link expirou ou foi cancelado.',410)
  const publicRecord=(item:any)=>({id:item.id,title:item.title,party:invite.party,name:invite.party==='client'?item.client_name:item.duuk_name,pages:item.pages,fields:item.fields.filter((f:any)=>f.party===invite.party),status:item.status,signed:Boolean(invite.signed_at),expires_at:invite.expires_at})
  if(body.action==='get')return json({...publicRecord(contract),original_url:await signedUrl(db,contract.original_path),signed_url:contract.rendered_version===contract.version ? await signedUrl(db,contract.signed_path) : null},headers)
  if(body.action!=='sign')throw new HttpError('Operação inválida.')
  if(body.accepted!==true)throw new HttpError('É necessário ler e aceitar o documento.')
  const name=text(body.name,'seu nome completo')
  if(name.length<2)throw new HttpError('Informe seu nome completo.')
  if(typeof body.png!=='string'||!body.png.startsWith('data:image/png;base64,')||body.png.length>200000)throw new HttpError('Desenhe sua assinatura.')
  try{
    const probe=await PDFDocument.create(),image=await probe.embedPng(body.png)
    if(image.width>2000||image.height>1000||image.width<50||image.height<30)throw new Error()
  }catch{throw new HttpError('Desenhe uma assinatura válida.')}
  const values:Record<string,string>={}
  for(const field of contract.fields.filter((f:any)=>f.party===invite.party&&f.type==='text'))values[field.id]=text(body.values?.[field.id],field.label||'o campo de texto',200)
  const payload={name,png:body.png,values,consent:'Li o documento e concordo em assiná-lo eletronicamente, registrando meu nome, assinatura, data, endereço IP e navegador como evidências de aceite.',ip:(req.headers.get('x-forwarded-for')||'').split(',')[0].trim().slice(0,64)||null,user_agent:req.headers.get('user-agent')||''}
  const snapshot=checked(await db.rpc('duuk_office_sign',{digest,payload}))
  const rendered=await renderSigned(db,snapshot)
  return json({...publicRecord(rendered),signed:true,signed_url:await signedUrl(db,rendered.signed_path)},headers)
})

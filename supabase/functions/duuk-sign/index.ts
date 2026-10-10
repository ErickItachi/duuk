import { checked, database, handler, HttpError, json, readJson, sha256, signedUrl, text, uuid } from '../_shared/http.ts'
import { PDFDocument, renderSigned } from '../_shared/pdf.ts'
import { mailCredentials, smtpTransport } from '../_shared/mail.ts'
import { newVerificationToken, normalizeSigningEmail, requestSigningCode, sendSigningCode, signingCodeHash, signingEmailHint } from '../_shared/sign-verification.mjs'

handler(async(req,headers)=>{
  if(Number(req.headers.get('content-length'))>250000)throw new HttpError('Assinatura muito grande.')
  const body=await readJson(req,250000)
  if(!/^[a-f0-9]{64}$/.test(body.token||''))throw new HttpError('Link inválido.',404)
  const db=database(),digest=await sha256(body.token)
  const invite=checked(await db.from('duuk_contract_invites').select('*').eq('token_hash',digest).maybeSingle())
  if(!invite)throw new HttpError('Link inválido.',404)
  const contract=checked(await db.from('duuk_contracts').select('*').eq('id',invite.contract_id).single())
  if(invite.revoked_at||Date.parse(invite.expires_at)<Date.now()||contract.status==='cancelled'||contract.deleted_at)throw new HttpError('Este link expirou ou foi cancelado.',410)
  const verificationRpc=async(operation:string,payload:any)=>{
    const result=checked(await db.rpc('duuk_sign_verification_backend',{operation,payload}))
    if(result?.error)throw new HttpError(result.error,result.status||400)
    return result
  }
  const proofHash=body.verification_token ? /^[a-f0-9]{64}$/.test(body.verification_token) ? await sha256(body.verification_token) : null : null
  const required=invite.verification_required===true
  const minimalVerification={required,verified:false,email_hint:required?signingEmailHint(invite.recipient_email):null}
  const access=async()=>verificationRpc('access',{digest,proof_hash:proofHash})
  const publicRecord=(item:any,verification:any)=>({id:item.id,title:item.title,party:invite.party,name:invite.party==='client'?item.client_name:item.duuk_name,pages:item.pages,fields:item.fields.filter((f:any)=>f.party===invite.party),status:item.status,signed:Boolean(invite.signed_at),expires_at:invite.expires_at,verification})
  const readableRecord=async(verification:any)=>({...publicRecord(contract,verification),original_url:await signedUrl(db,contract.original_path),signed_url:contract.rendered_version===contract.version ? await signedUrl(db,contract.signed_path) : null})
  if(body.action==='get'){
    if(required&&!proofHash)return json({title:'',name:'',pages:[],fields:[],party:invite.party,signed:Boolean(invite.signed_at),expires_at:invite.expires_at,verification:minimalVerification,original_url:null,signed_url:null},headers)
    return json(await readableRecord(await access()),headers)
  }
  if(body.action==='request_otp'){
    if(!required)throw new HttpError('Este link não solicita código por e-mail.')
    let email:string
    try{email=normalizeSigningEmail(body.email)}catch{throw new HttpError('Informe um e-mail válido.')}
    const credentials=await mailCredentials(db)
    if(!credentials.password)throw new HttpError('A confirmação por e-mail está temporariamente indisponível. Fale com a DUUK.',503)
    const {pepper}=await verificationRpc('secrets',{})
    try{return json(await requestSigningCode({digest,email,client_request_id:uuid(body.client_request_id)},{rpc:verificationRpc,pepper,send:(recipient:string,code:string)=>sendSigningCode(credentials,smtpTransport,recipient,code)}),headers)}
    catch(error){if(error instanceof HttpError)throw error;throw new HttpError('Não foi possível enviar o código. Aguarde um minuto e tente novamente.',502)}
  }
  if(body.action==='verify_otp'){
    if(!required)throw new HttpError('Este link não solicita código por e-mail.')
    const code=text(body.code,'o código',6)
    if(!/^\d{6}$/.test(code))throw new HttpError('Informe os seis dígitos do código.')
    const challengeId=uuid(body.challenge_id),verificationToken=newVerificationToken(),{pepper}=await verificationRpc('secrets',{})
    const verified=await verificationRpc('verify',{digest,challenge_id:challengeId,code_hash:await signingCodeHash(pepper,challengeId,code),proof_hash:await sha256(verificationToken)})
    const verification={required:true,...verified}
    return json({verification_token:verificationToken,record:await readableRecord(verification)},headers)
  }
  if(body.action!=='sign')throw new HttpError('Operação inválida.')
  const verification=await access()
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
  const consent='Li o documento e concordo em assiná-lo eletronicamente, registrando meu nome, assinatura, data, endereço IP e navegador como evidências de aceite.'+(required?' Confirmo o acesso ao e-mail do participante por código e autorizo o registro dessa confirmação como evidência.':'')
  const payload={name,png:body.png,values,consent,ip:(req.headers.get('x-forwarded-for')||'').split(',')[0].trim().slice(0,64)||null,user_agent:req.headers.get('user-agent')||'',verification_hash:proofHash}
  const snapshot=checked(await db.rpc('duuk_office_sign',{digest,payload}))
  const rendered=await renderSigned(db,snapshot)
  return json({...publicRecord(rendered,verification),signed:true,signed_url:await signedUrl(db,rendered.signed_path)},headers)
})

import { admin, checked, database, handler, HttpError, json, readBody, readJson, sha256, signedUrl, text, uuid } from '../_shared/http.ts'
import { fieldsFor, PDFDocument, renderSigned } from '../_shared/pdf.ts'

handler(async(req,headers)=>{
  const db=database(),user=await admin(req,db)
  if(req.headers.get('content-type')?.includes('multipart/form-data')){
    if(Number(req.headers.get('content-length'))>11000000)throw new HttpError('Envie um PDF de até 10 MB.')
    const form=await new Response(await readBody(req,11000000),{headers:{'Content-Type':req.headers.get('content-type')!}}).formData(),file=form.get('file')
    if(!(file instanceof File)||file.size>10485760||!file.size)throw new HttpError('Envie um PDF de até 10 MB.')
    const bytes=new Uint8Array(await file.arrayBuffer())
    let pdf
    try{pdf=await PDFDocument.load(bytes)}catch{throw new HttpError('Use um PDF válido, sem senha.')}
    if(pdf.getPageCount()>30)throw new HttpError('Use um PDF de até 30 páginas.')
    const title=text(form.get('title'),'o título'),client_name=text(form.get('client_name'),'o nome do cliente'),duuk_name=text(form.get('duuk_name'),'o representante da DUUK'),client_email=text(form.get('client_email'),'o e-mail',254,false)
    if(client_email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client_email))throw new HttpError('Confira o e-mail do cliente.')
    const id=crypto.randomUUID(),path=`original/${id}/${crypto.randomUUID()}.pdf`
    const pages=pdf.getPages().map(p=>{const b=p.getCropBox();return {width:b.width,height:b.height,rotation:((p.getRotation().angle%360)+360)%360}})
    if(pages.some(p=>p.width<100||p.height<100||p.width>3000||p.height>3000||![0,90,180,270].includes(p.rotation)))throw new HttpError('Confira o tamanho e a orientação das páginas.')
    checked(await db.storage.from('duuk-documents').upload(path,bytes,{contentType:'application/pdf',upsert:false}))
    const insert=await db.from('duuk_contracts').insert({id,title,client_name,client_email,duuk_name,original_path:path,original_sha256:await sha256(bytes),pages,created_by:user.id}).select().single()
    if(insert.error){await db.storage.from('duuk-documents').remove([path]);checked(insert)}
    return json(insert.data,headers)
  }
  const body=await readJson(req,50000),id=uuid(body.id)
  const contract=checked(await db.from('duuk_contracts').select('*').eq('id',id).maybeSingle())
  if(!contract)throw new HttpError('Contrato não encontrado.',404)
  if(body.action==='details'){
    const signatures=checked(await db.from('duuk_contract_signatures').select('id,party,signer_name,signed_at,consent,ip_address,user_agent,field_values').eq('contract_id',id).order('signed_at'))
    const invites=checked(await db.from('duuk_contract_invites').select('party,expires_at,revoked_at,signed_at').eq('contract_id',id).order('created_at',{ascending:false}))
    return json({contract,signatures,invites,original_url:await signedUrl(db,contract.original_path),signed_url:await signedUrl(db,contract.signed_path)},headers)
  }
  if(body.action==='fields')return json(checked(await db.rpc('duuk_office_fields',{target:id,document:fieldsFor(body.fields,contract.pages),revision:body.version})),headers)
  if(body.action==='invite'){
    const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('')
    const result=checked(await db.rpc('duuk_office_invite',{target:id,side:body.party,digest:await sha256(token),revision:body.version}))
    return json({...result,url:`https://www.duukfilms.com/assinar/${token}`},headers)
  }
  if(body.action==='cancel')return json(checked(await db.rpc('duuk_office_cancel',{target:id,revision:body.version})),headers)
  if(body.action==='trash'||body.action==='restore')return json(checked(await db.rpc('duuk_office_trash',{target:id,revision:body.version,restore:body.action==='restore'})),headers)
  if(body.action==='delete'){
    const path=checked(await db.rpc('duuk_office_delete',{target:id,revision:body.version}))
    checked(await db.storage.from('duuk-documents').remove([path]))
    return json({deleted:true},headers)
  }
  if(body.action==='render'){
    const signatures=checked(await db.from('duuk_contract_signatures').select('*').eq('contract_id',id).order('signed_at'))||[]
    if(!signatures.length)throw new HttpError('O contrato ainda não tem assinaturas.')
    const rendered=await renderSigned(db,{contract,signatures})
    return json({contract:rendered,signed_url:await signedUrl(db,rendered.signed_path)},headers)
  }
  throw new HttpError('Operação inválida.')
})

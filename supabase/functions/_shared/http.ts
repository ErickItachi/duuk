import { createClient } from 'npm:@supabase/supabase-js@2.117.2'

export class HttpError extends Error { constructor(message: string, public status = 400) { super(message) } }
export const database = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
export function cors(req: Request) {
  const origin = req.headers.get('origin') || ''
  if (origin && !['https://www.duukfilms.com','https://duukfilms.com'].includes(origin) && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin) && !/^https:\/\/duuk-[a-z0-9-]+-duuk1\.vercel\.app$/.test(origin)) throw new HttpError('Origem não permitida.',403)
  return { 'Access-Control-Allow-Origin': origin || 'https://www.duukfilms.com', 'Access-Control-Allow-Headers': 'authorization,x-client-info,apikey,content-type,x-supabase-client-platform,x-supabase-client-platform-version,x-supabase-client-runtime,x-supabase-client-runtime-version', 'Access-Control-Allow-Methods':'POST,OPTIONS', 'Vary':'Origin', 'Cache-Control':'no-store' }
}
export function json(data: unknown, headers: Record<string,string>, status = 200) { return new Response(JSON.stringify(data), {status,headers:{...headers,'Content-Type':'application/json'}}) }
export function checked<T>(result: { data: T, error: any }): T { if (result.error) { const code=String(result.error.code||''); throw new HttpError(code.startsWith('PT') ? result.error.message : 'Não foi possível concluir a operação.',code.startsWith('PT') ? Number(code.slice(2)) : 500) } return result.data }
export async function admin(req: Request, db: ReturnType<typeof database>) {
  const token = /^Bearer (.+)$/.exec(req.headers.get('authorization') || '')?.[1]
  if (!token) throw new HttpError('Entre no painel.',401)
  const { data, error } = await db.auth.getUser(token)
  if (error || !data.user) throw new HttpError('Sua sessão expirou. Entre novamente.',401)
  const member = checked(await db.from('duuk_admins').select('user_id').eq('user_id',data.user.id).maybeSingle())
  if (!member) throw new HttpError('Esta conta não tem acesso ao administrativo.',403)
  return data.user
}
export async function sha256(input: string | Uint8Array) {
  const bytes=typeof input==='string' ? new TextEncoder().encode(input) : new Uint8Array(input)
  const digest=await crypto.subtle.digest('SHA-256',bytes)
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')
}
export function text(value: unknown, label: string, max=160, required=true) { const out=String(value||'').trim(); if ((required && !out) || out.length>max) throw new HttpError(`Confira ${label}.`); return out }
export function uuid(value: unknown) { if (!/^[a-f0-9-]{36}$/.test(String(value))) throw new HttpError('Identificador inválido.'); return String(value) }
export async function readBody(req: Request,maximum: number) {
  if(Number(req.headers.get('content-length'))>maximum)throw new HttpError('Arquivo ou requisição muito grande.',413)
  const reader=req.body?.getReader();if(!reader)throw new HttpError('Requisição vazia.')
  const chunks:Uint8Array[]=[];let size=0
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maximum){await reader.cancel();throw new HttpError('Arquivo ou requisição muito grande.',413)}chunks.push(value)}
  const output=new Uint8Array(size);let offset=0;for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.length}return output
}
export async function readJson(req: Request,maximum: number) { try{return JSON.parse(new TextDecoder().decode(await readBody(req,maximum)))}catch(error){if(error instanceof HttpError)throw error;throw new HttpError('Requisição inválida.')} }
export async function signedUrl(db: ReturnType<typeof database>, path: string | null) {
  if(!path)return null
  const signed=checked(await db.storage.from('duuk-documents').createSignedUrl(path,120))
  if(!signed)throw new HttpError('Arquivo indisponível.',500)
  return signed.signedUrl
}
export function handler(work: (req: Request, headers: Record<string,string>)=>Promise<Response>) {
  Deno.serve(async req=>{ let headers: Record<string,string>={}; try { headers=cors(req); if(req.method==='OPTIONS')return new Response(null,{status:204,headers}); if(req.method!=='POST')throw new HttpError('Método não permitido.',405); return await work(req,headers) } catch(error) { return json({error: error instanceof HttpError ? error.message : 'Não foi possível concluir. Tente novamente.'},headers,error instanceof HttpError ? error.status : 500) } })
}

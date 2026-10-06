import { supabase, MEDIA_BUCKET, MAX_UPLOAD_BYTES } from './supabase'
import { MEDIA_PREFIX } from './model'

let signedCache = { scope: '', expires: 0, paths: '', urls: {} }
const fail = (error) => { if (error) throw new Error(error.message || 'Não foi possível salvar. Tente novamente.') }

export async function readCloud(isAdmin) {
  const [contentResult, mediaResult] = await Promise.all([
    supabase.from('duuk_content').select('key,content,version,source_version').in('key', isAdmin ? ['draft', 'published'] : ['published']),
    supabase.from('duuk_media').select('id,path,name,type,size,created_at').eq('deleting', false).order('created_at', { ascending: false }),
  ])
  fail(contentResult.error); fail(mediaResult.error)
  const published = contentResult.data.find((row) => row.key === 'published')
  const draft = contentResult.data.find((row) => row.key === 'draft')
  if (!published || (isAdmin && !draft)) throw new Error('O conteúdo do preview não está disponível. Tente recarregar.')
  const media = mediaResult.data.map((file) => ({ ...file, id: `${MEDIA_PREFIX}${file.id}`, createdAt: file.created_at }))
  const paths = JSON.stringify(media.map((file) => file.path))
  const scope = isAdmin ? 'admin' : 'public'
  if (signedCache.scope !== scope || signedCache.paths !== paths || signedCache.expires < Date.now()) {
    const urls = {}
    if (media.length) {
      const result = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(media.map((file) => file.path), 3600)
      fail(result.error)
      for (const [index, signed] of result.data.entries()) {
        if (signed.error || !signed.signedUrl) throw new Error('Não foi possível carregar uma mídia. Tente novamente.')
        urls[media[index].id] = signed.signedUrl
      }
    }
    signedCache = { scope, paths, urls, expires: Date.now() + 45 * 60 * 1000 }
  }
  return { draft: draft?.content || published.content, published: published.content, media, urls: signedCache.urls,
    version: draft?.version || published.source_version, publishedVersion: published.source_version }
}

export async function saveCloudDraft(document, version) {
  const { error } = await supabase.rpc('duuk_save_draft', { document, expected_version: version })
  fail(error)
}
export async function publishCloud(version) {
  const { error } = await supabase.rpc('duuk_publish', { expected_version: version })
  fail(error)
}

export async function uploadCloud(file, kind, onProgress = () => {}) {
  const accepted = kind === 'image' ? ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] : ['video/mp4', 'video/webm']
  if (!accepted.includes(file.type)) throw new Error(kind === 'image' ? 'Envie uma imagem JPG, PNG, WebP ou AVIF.' : 'Envie um vídeo MP4 ou WebM.')
  if (!file.size) throw new Error('O arquivo está vazio.')
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('Cada arquivo pode ter até 50 MB. Para vídeos maiores, use um endereço HTTPS ou o YouTube.')
  const { data: { session }, error } = await supabase.auth.getSession()
  fail(error)
  if (!session) throw new Error('Entre novamente para enviar arquivos.')
  const id = crypto.randomUUID()
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'video/mp4': 'mp4', 'video/webm': 'webm' }[file.type]
  const path = `${session.user.id}/${id}.${extension}`
  onProgress(0)
  if (file.size <= 6 * 1024 * 1024) {
    const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, { contentType: file.type, cacheControl: '31536000', upsert: false })
    fail(uploadError)
  } else {
    const { Upload } = await import('tus-js-client')
    const url = new URL(supabase.supabaseUrl)
    url.hostname = url.hostname.replace('.supabase.co', '.storage.supabase.co')
    await new Promise((resolve, reject) => {
      const upload = new Upload(file, {
        endpoint: `${url.origin}/storage/v1/upload/resumable`,
        headers: { authorization: `Bearer ${session.access_token}`, apikey: supabase.supabaseKey, 'x-upsert': 'false' },
        retryDelays: [0, 3000, 5000, 10000, 20000],
        uploadDataDuringCreation: true, removeFingerprintOnSuccess: true, chunkSize: 6 * 1024 * 1024,
        metadata: { bucketName: MEDIA_BUCKET, objectName: path, contentType: file.type, cacheControl: '31536000' },
        onProgress: (sent, total) => onProgress(Math.round(sent / total * 100)),
        onError: () => reject(new Error('O envio foi interrompido. Confira a conexão e tente novamente.')),
        onSuccess: resolve,
      })
      upload.start()
    })
  }
  const metadata = await supabase.from('duuk_media').insert({ id, path, name: file.name.slice(0, 255), type: file.type, size: file.size })
  if (metadata.error) {
    await supabase.storage.from(MEDIA_BUCKET).remove([path])
    fail(metadata.error)
  }
  onProgress(100)
  return `${MEDIA_PREFIX}${id}`
}

export async function removeCloudMedia(ref) {
  const id = ref.slice(MEDIA_PREFIX.length)
  const preparation = await supabase.rpc('duuk_prepare_media_delete', { media_id: id })
  fail(preparation.error)
  const result = await supabase.storage.from(MEDIA_BUCKET).remove([preparation.data])
  if (result.error) {
    await supabase.rpc('duuk_prepare_media_delete', { media_id: id, cancel_delete: true })
    fail(result.error)
  }
  const deleted = await supabase.from('duuk_media').delete().eq('id', id)
  fail(deleted.error)
}

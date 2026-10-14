import { supabase } from '../content/supabase'
import { checked, platformRequest, rows } from '../admin/api'
import { joinPosts } from './model'

export const socialRequest = body => platformRequest('duuk-social', body)
export const bucket = 'duuk-social'

async function rpc(name, args) { return checked(await supabase.rpc(name, args)) }

export async function loadLibrary() {
  return rows('duuk_social_media', query => query.order('created_at', { ascending: false }))
}

export async function loadPosts() {
  const [posts, links, media] = await Promise.all([
    rows('duuk_social_posts', query => query.order('updated_at', { ascending: false })),
    rows('duuk_social_post_media'),
    loadLibrary(),
  ])
  return { posts: joinPosts(posts, links, media), media }
}

export async function loadEvents(postId) {
  return checked(await supabase.from('duuk_social_events').select('*').eq('post_id', postId).order('created_at', { ascending: false }).limit(30)) || []
}

export async function loadSnapshots(accountId) {
  return rows('duuk_social_snapshots', query => query.eq('account_id', accountId).order('day', { ascending: true }))
}

export const savePost = payload => rpc('duuk_social_post_save', { payload })
export const unschedulePost = post => rpc('duuk_social_post_unschedule', { post_id: post.id, expected_version: post.version })
export const deletePost = post => rpc('duuk_social_post_delete', { post_id: post.id, expected_version: post.version })
export const publishNow = post => socialRequest({ action: 'publish_now', post_id: post.id, expected_version: post.version })
export const updateMedia = payload => rpc('duuk_social_media_update', { payload })

export async function deleteMedia(item) {
  const result = await rpc('duuk_social_media_delete', { media_id: item.id, expected_version: item.version })
  // The row is gone; the files go next. A failure here leaves only an orphan file in the private bucket.
  if (result?.paths?.length) await supabase.storage.from(bucket).remove(result.paths).catch(() => null)
  forgetUrls(result?.paths || [])
  return result
}

// Signed links last one hour and are reused while valid, so the grid does not re-sign every render.
const signed = new Map()
export async function signedUrls(paths) {
  const now = Date.now(), wanted = [...new Set(paths.filter(Boolean))]
  const missing = wanted.filter(path => !(signed.get(path)?.expires > now + 60000))
  if (missing.length) {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrls(missing, 3600)
    if (error) throw new Error('Não foi possível carregar as prévias da biblioteca.')
    for (const entry of data || []) if (entry.signedUrl) signed.set(entry.path, { url: entry.signedUrl, expires: now + 3600000 })
  }
  return Object.fromEntries(wanted.map(path => [path, signed.get(path)?.url || null]))
}
function forgetUrls(paths) { for (const path of paths) signed.delete(path) }

// Uploads go straight to the private bucket under the member's folder, then the database checks the
// stored object (type and size) before adding it to the library.
export async function uploadPrepared({ file, contentType, extension, poster, meta, onProgress }) {
  const { data } = await supabase.auth.getUser()
  const owner = data?.user?.id
  if (!owner) throw new Error('Sua sessão expirou. Entre novamente.')
  const path = `${owner}/${crypto.randomUUID()}.${extension}`
  onProgress?.('Enviando arquivo…')
  const upload = await supabase.storage.from(bucket).upload(path, file, { contentType, upsert: false, cacheControl: '3600' })
  if (upload.error) throw new Error(/size|large|exceed/i.test(upload.error.message) ? 'O arquivo passa do limite de 50 MB.' : 'Não foi possível enviar o arquivo. Tente novamente.')
  let posterPath = null
  if (poster) {
    posterPath = `${owner}/${crypto.randomUUID()}.jpg`
    const sent = await supabase.storage.from(bucket).upload(posterPath, poster, { contentType: 'image/jpeg', upsert: false })
    if (sent.error) posterPath = null
  }
  onProgress?.('Registrando na biblioteca…')
  try {
    return await rpc('duuk_social_media_register', { payload: { storage_path: path, poster_path: posterPath, ...meta } })
  } catch (error) {
    await supabase.storage.from(bucket).remove([path, posterPath].filter(Boolean)).catch(() => null)
    throw error
  }
}

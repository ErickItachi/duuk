import { supabase } from '../content/supabase'
import { platformRequest } from '../admin/api'
import { readAiStream } from './stream.mjs'

export const aiRequest = body => platformRequest('duuk-ai', body)

// Authentication stays in the existing Supabase session. Gemini credentials never
// enter this client; the Edge Function verifies the member on every request.
export async function streamAiRequest(body, { signal, onEvent }) {
  if (navigator.onLine === false) throw new Error('Você está offline. Reconecte para conversar.')
  const { data: { session }, error } = await supabase.auth.getSession()
  if (error || !session?.access_token) throw new Error('Sua sessão expirou. Entre novamente.')
  const response = await fetch(`${supabase.supabaseUrl}/functions/v1/duuk-ai`, {
    method: 'POST', signal, redirect: 'error',
    headers: { Authorization: `Bearer ${session.access_token}`, apikey: supabase.supabaseKey, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ ...body, action: 'generate' }),
  })
  if (!response.ok) {
    let message = 'Não foi possível gerar a resposta. Tente novamente.'
    try { message = (await response.json()).error || message } catch {}
    throw new Error(message)
  }
  return readAiStream(response, { onEvent })
}

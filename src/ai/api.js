import { supabase } from '../content/supabase'
import { readAiStream } from './stream.mjs'

export async function aiRequest(body) {
  if (navigator.onLine === false) throw new Error('Você está offline. Reconecte para continuar.')
  const { data, error } = await supabase.functions.invoke('duuk-ai', { body })
  if (error) {
    let message = 'Não foi possível concluir. Tente novamente.'
    const status = Number(error.context?.status) || undefined
    try { const result = await error.context?.json(); if (result?.error) message = result.error } catch {}
    const failure = new Error(message)
    failure.status = status
    throw failure
  }
  if (data?.error) throw new Error(data.error)
  return data
}

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

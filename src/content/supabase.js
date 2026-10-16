import { createClient } from '@supabase/supabase-js'
import { adminEnabled } from './config'
import config from './supabaseConfig.json'
import { adminAuthStorageKey } from './sessionExit.mjs'

const sessionStorageAdapter = {
  getItem(key) { try { return sessionStorage.getItem(key) ?? localStorage.getItem(key) } catch { return null } },
  setItem(key, value) { try { const persistent = localStorage.getItem('duuk-remember') !== 'false'; (persistent ? localStorage : sessionStorage).setItem(key, value); (persistent ? sessionStorage : localStorage).removeItem(key) } catch {} },
  removeItem(key) { try { sessionStorage.removeItem(key); localStorage.removeItem(key) } catch {} },
}

export const supabase = adminEnabled ? createClient(
  import.meta.env.VITE_SUPABASE_URL || config.url,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || config.publishableKey,
  { auth: { persistSession: true, storage: sessionStorageAdapter, autoRefreshToken: true, detectSessionInUrl: false, storageKey: adminAuthStorageKey } },
) : null
export const MEDIA_BUCKET = 'duuk-media'
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

// Re-authentication must not replace the active AAL2 session with a new AAL1
// session, nor broadcast the temporary password check to the other tabs.
export async function verifyCurrentPassword(email, password) {
  const verifier = createClient(supabase.supabaseUrl, supabase.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: `duuk-password-check-${crypto.randomUUID()}` },
  })
  try {
    const { error } = await verifier.auth.signInWithPassword({ email, password })
    if (error) throw new Error('A senha atual não confere ou a verificação está temporariamente limitada.')
  } finally { await verifier.auth.signOut({ scope: 'local' }).catch(() => {}) }
}

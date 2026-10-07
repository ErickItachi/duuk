import { createClient } from '@supabase/supabase-js'
import { adminEnabled } from './config'
import config from './supabaseConfig.json'

const sessionStorageAdapter = {
  getItem(key) { try { return sessionStorage.getItem(key) ?? localStorage.getItem(key) } catch { return null } },
  setItem(key, value) { try { const persistent = localStorage.getItem('duuk-remember') !== 'false'; (persistent ? localStorage : sessionStorage).setItem(key, value); (persistent ? sessionStorage : localStorage).removeItem(key) } catch {} },
  removeItem(key) { try { sessionStorage.removeItem(key); localStorage.removeItem(key) } catch {} },
}

export const supabase = adminEnabled ? createClient(
  import.meta.env.VITE_SUPABASE_URL || config.url,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || config.publishableKey,
  { auth: { persistSession: true, storage: sessionStorageAdapter, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'duuk-admin-auth' } },
) : null
export const MEDIA_BUCKET = 'duuk-media'
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

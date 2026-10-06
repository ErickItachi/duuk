import { createClient } from '@supabase/supabase-js'
import { adminEnabled } from './config'
import config from './supabaseConfig.json'

export const supabase = adminEnabled ? createClient(
  import.meta.env.VITE_SUPABASE_URL || config.url,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || config.publishableKey,
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'duuk-admin-auth' } },
) : null
export const MEDIA_BUCKET = 'duuk-media'
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

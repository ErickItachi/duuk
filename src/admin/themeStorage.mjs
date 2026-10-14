const prefix = 'duuk-admin-theme:'
const preferences = new Set(['light', 'dark', 'system'])

export function adminThemeKey(userId) {
  return `${prefix}${typeof userId === 'string' && userId.trim() ? userId : 'guest'}`
}

// Stored preference: light, dark or system (follows the device). Anything else falls back to dark.
export function readAdminTheme(storage, userId) {
  try { const value = storage?.getItem(adminThemeKey(userId)); return preferences.has(value) ? value : 'dark' }
  catch { return 'dark' }
}

export function writeAdminTheme(storage, userId, theme) {
  const value = preferences.has(theme) ? theme : 'dark'
  try { storage?.setItem(adminThemeKey(userId), value) } catch { /* The current tab still supports the selected theme. */ }
  return value
}

export function resolveAdminTheme(preference, prefersLight) {
  return preference === 'system' ? (prefersLight ? 'light' : 'dark') : preference === 'light' ? 'light' : 'dark'
}

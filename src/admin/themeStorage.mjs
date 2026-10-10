const prefix = 'duuk-admin-theme:'

export function adminThemeKey(userId) {
  return `${prefix}${typeof userId === 'string' && userId.trim() ? userId : 'guest'}`
}

export function readAdminTheme(storage, userId) {
  try { return storage?.getItem(adminThemeKey(userId)) === 'light' ? 'light' : 'dark' }
  catch { return 'dark' }
}

export function writeAdminTheme(storage, userId, theme) {
  const value = theme === 'light' ? 'light' : 'dark'
  try { storage?.setItem(adminThemeKey(userId), value) } catch { /* The current tab still supports the selected theme. */ }
  return value
}

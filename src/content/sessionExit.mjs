export const adminAuthStorageKey = 'duuk-admin-auth'

// Clear only authentication state. Themes, release acknowledgements, other
// accounts' preferences and application caches are not logout credentials.
export function clearAdminAuthStorage(storages = []) {
  for (const provide of storages) {
    try {
      const storage = typeof provide === 'function' ? provide() : provide
      if (!storage) continue
      for (let index = storage.length - 1; index >= 0; index--) {
        const key = storage.key(index)
        if (key === adminAuthStorageKey || key?.startsWith(`${adminAuthStorageKey}-`)) storage.removeItem(key)
      }
    } catch { /* A blocked storage cannot retain a readable browser session. */ }
  }
}

export async function removeDeviceSubscription(subscription, unregister) {
  if (!subscription) return
  try { await unregister(subscription.endpoint) }
  finally { await subscription.unsubscribe() }
}

export async function endAdminSession({ auth, unsubscribePush, offline, clearStorage, disconnect, onOfflineExit }) {
  try { await unsubscribePush() } catch { /* A push or network failure must not prevent logout. */ }
  let error
  try { ({ error } = await auth.signOut({ scope: 'local' })) }
  catch (cause) { error = cause }
  if (!error) return { offline: false }
  if (!offline()) throw new Error('Não foi possível encerrar a sessão. Tente novamente.')
  // An offline fallback removes this browser's credentials and memory. It
  // does not claim to revoke a token on the unavailable authentication server.
  try { await auth.stopAutoRefresh() } catch {}
  clearStorage()
  try { await disconnect() } catch {}
  onOfflineExit()
  return { offline: true }
}

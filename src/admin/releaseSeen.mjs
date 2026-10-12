// Closing release notes never depends on network access or server permissions.
const acknowledged = new Set()
export const releaseSeenKey = (userId, version) => `duuk-release-seen:${userId}:${version}`
export function hasSeenRelease(storage, userId, version) {
  const key = releaseSeenKey(userId, version)
  if (acknowledged.has(key)) return true
  try { return storage?.getItem(key) === '1' } catch { return false }
}
export function markReleaseSeen(storage, userId, version) {
  const key = releaseSeenKey(userId, version)
  acknowledged.add(key)
  try { storage?.setItem(key, '1') } catch { /* Memory still dismisses this session. */ }
}

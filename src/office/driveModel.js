export function driveState(contract, documents) {
  if (!documents.length) return contract?.status === 'signed' ? 'pending' : null
  if (documents.some(item => item.status === 'error')) return 'error'
  if (contract?.status === 'signed' && !documents.some(item => item.kind === 'contract_signed')) return 'pending'
  return documents.every(item => item.status === 'synced') ? 'synced' : 'pending'
}

export function safeDriveLink(value) {
  try {
    const url = new URL(value)
    return url.origin === 'https://drive.google.com' && !url.username && !url.password ? url.href : ''
  } catch { return '' }
}

export function safeDocumentUrl(value, storageOrigin) {
  try {
    const url = new URL(value), origin = new URL(storageOrigin)
    return url.origin === origin.origin && !url.username && !url.password && ['/storage/v1/object/sign/duuk-documents/', '/storage/v1/object/sign/duuk-drive-files/'].some(prefix => url.pathname.startsWith(prefix)) ? url.href : ''
  } catch { return '' }
}

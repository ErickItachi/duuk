export function driveState(contract, documents) {
  if (!documents.length) return null
  if (documents.some(item => item.status === 'error')) return 'error'
  if (contract?.status === 'signed' && !documents.some(item => item.kind === 'contract_signed')) return 'pending'
  return documents.every(item => item.status === 'synced') ? 'synced' : 'pending'
}

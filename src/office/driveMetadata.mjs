export const driveNameLimit = type => type === 'folder' ? 90 : 200

// Match the existing private RPC before starting a Google operation.
export function driveMetadataError({ name, description = '', type, originalName = '' }) {
 const trimmed = String(name || '').trim()
 if (!trimmed) return 'Informe um nome.'
 if (trimmed.length > driveNameLimit(type)) return `Use até ${driveNameLimit(type)} caracteres no nome.`
 if (/[\\/:*?"<>|]/.test(trimmed) || Array.from(trimmed).some(character => character.codePointAt(0) < 32 || character.codePointAt(0) === 127)) return 'O nome não pode conter /, \\, :, *, ?, aspas, <, > ou |.'
 if (String(description).length > 2000) return 'Use até 2.000 caracteres na descrição.'
 if (type === 'file') {
  const extension = originalName.match(/\.[^.]+$/)?.[0]?.toLowerCase()
  if (extension && trimmed.match(/\.[^.]+$/)?.[0]?.toLowerCase() !== extension) return 'Mantenha a extensão original do arquivo.'
 }
 return ''
}

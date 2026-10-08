export const libraryLimit = 20 * 1024 * 1024
export const libraryTypes = {
 pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
 txt: 'text/plain', csv: 'text/csv', zip: 'application/zip',
 docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
 mp4: 'video/mp4', mov: 'video/quicktime',
}
export function libraryFileType(name, bytes) {
 const ext = String(name).split('.').pop().toLowerCase(), mime = libraryTypes[ext]
 if (!mime || !bytes?.length || bytes.length > libraryLimit) throw new Error('Use PDF, imagens, documentos Office, TXT, CSV, ZIP ou vídeos MP4/MOV de até 20 MB.')
 const begins = (...signature) => signature.every((byte, index) => bytes[index] === byte)
 const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end))
 const valid = ext === 'pdf' ? ascii(0, 5) === '%PDF-' : ['jpg', 'jpeg'].includes(ext) ? begins(255, 216, 255)
  : ext === 'png' ? begins(137, 80, 78, 71, 13, 10, 26, 10)
  : ext === 'webp' ? ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP'
  : ['zip', 'docx', 'xlsx', 'pptx'].includes(ext) ? begins(80, 75) && [3, 5, 7].includes(bytes[2])
  : ['mp4', 'mov'].includes(ext) ? ['ftyp', 'moov', 'mdat', 'wide'].includes(ascii(4, 8))
  : !bytes.slice(0, 8192).includes(0)
 if (!valid) throw new Error('O conteúdo não corresponde ao formato do arquivo. Confira o arquivo e tente novamente.')
 return mime
}

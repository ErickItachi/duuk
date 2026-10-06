// Keep small assets unchanged; reduce large photos before using free storage.
export async function optimizeImage(file) {
  if (file.size <= 1024 * 1024 || !window.createImageBitmap) return file
  let bitmap
  try {
    bitmap = await createImageBitmap(file)
    const ratio = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * ratio)
    canvas.height = Math.round(bitmap.height * ratio)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', .86))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: blob.type })
  } catch { return file }
  finally { bitmap?.close() }
}

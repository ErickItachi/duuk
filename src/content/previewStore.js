const DB_NAME = 'duuk-admin-preview-v1'
let connection

function database() {
  if (!connection) {
    connection = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => {
        request.result.createObjectStore('content')
        request.result.createObjectStore('media', { keyPath: 'id' })
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => { connection = null; reject(new Error('O navegador não permitiu abrir os dados de teste.')) }
      request.onblocked = () => { connection = null; reject(new Error('Feche outras abas do preview e tente novamente.')) }
    })
  }
  return connection
}

async function transaction(stores, mode, action) {
  const db = await database()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode)
    const result = action(tx)
    tx.oncomplete = () => resolve(result)
    tx.onerror = () => reject(new Error('Não foi possível salvar. Confira o espaço disponível no navegador.'))
    tx.onabort = () => reject(new Error('A operação foi interrompida; os dados anteriores foram preservados.'))
  })
}

export async function readPreview() {
  const result = {}
  await transaction(['content', 'media'], 'readonly', (tx) => {
    for (const key of ['draft', 'published']) {
      const request = tx.objectStore('content').get(key)
      request.onsuccess = () => { result[key] = request.result }
    }
    const request = tx.objectStore('media').getAll()
    request.onsuccess = () => { result.media = request.result }
  })
  return result
}

export function writeContent(key, content) {
  return transaction(['content'], 'readwrite', (tx) => { tx.objectStore('content').put(content, key) })
}

export function writeMedia(media) {
  return transaction(['media'], 'readwrite', (tx) => { tx.objectStore('media').put(media) })
}

export function deleteMedia(id) {
  return transaction(['media'], 'readwrite', (tx) => { tx.objectStore('media').delete(id) })
}

export function clearPreview() {
  return transaction(['content', 'media'], 'readwrite', (tx) => {
    tx.objectStore('content').clear()
    tx.objectStore('media').clear()
  })
}

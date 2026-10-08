import test from 'node:test'
import assert from 'node:assert/strict'
import { libraryFileType, libraryLimit } from '../supabase/functions/_shared/drive-files.mjs'
import { safeDocumentUrl } from '../src/office/driveModel.js'
test('biblioteca aceita formatos conhecidos e rejeita conteúdo ativo, extensão divergente e arquivos grandes', () => {
 assert.equal(libraryFileType('Briefing.txt', new TextEncoder().encode('Briefing DUUK')), 'text/plain')
 assert.equal(libraryFileType('Foto.PNG', new Uint8Array([137,80,78,71,13,10,26,10])), 'image/png')
 assert.equal(libraryFileType('Proposta.pdf', new TextEncoder().encode('%PDF-1.7')), 'application/pdf')
 assert.equal(libraryFileType('Planilha.xlsx', new Uint8Array([80,75,3,4])), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
 for (const name of ['injetar.html', 'injetar.svg', 'script.js', 'arquivo.exe']) assert.throws(() => libraryFileType(name,new TextEncoder().encode('<script>')))
 assert.throws(() => libraryFileType('falso.png',new TextEncoder().encode('<script>')))
 assert.throws(() => libraryFileType('vazio.txt',new Uint8Array()))
 assert.throws(() => libraryFileType('grande.zip',new Uint8Array(libraryLimit+1)))
})
test('downloads da biblioteca exigem URL assinada do bucket privado e da origem Supabase', () => {
 const origin='https://example.supabase.co', url=origin+'/storage/v1/object/sign/duuk-drive-files/files/fixture?token=fixture'
 assert.equal(safeDocumentUrl(url,origin),url)
 for(const unsafe of [url.replace('example.supabase.co','evil.test'),url.replace('/sign/','/public/'),url.replace('duuk-drive-files','outro-bucket')]) assert.equal(safeDocumentUrl(unsafe,origin),'')
})

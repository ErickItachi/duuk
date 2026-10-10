import test from 'node:test'
import assert from 'node:assert/strict'
import { driveMetadataError, driveNameLimit } from '../src/office/driveMetadata.mjs'

test('editor usa os limites reais de pastas e arquivos antes da operação Google', () => {
 assert.equal(driveNameLimit('folder'), 90)
 assert.equal(driveNameLimit('file'), 200)
 assert.equal(driveMetadataError({ type: 'folder', name: '  Pasta da equipe  ' }), '')
 assert.equal(driveMetadataError({ type: 'folder', name: 'a'.repeat(90) }), '')
 assert.match(driveMetadataError({ type: 'folder', name: 'a'.repeat(91) }), /90 caracteres/)
 assert.match(driveMetadataError({ type: 'folder', name: ' ' }), /Informe um nome/)
 for (const name of ['Cliente/Projeto', 'Cliente\\Projeto', 'Cliente:Projeto', 'Cliente\u0000Projeto', 'Nome?']) assert.match(driveMetadataError({ type: 'folder', name }), /nome não pode conter/)
 assert.match(driveMetadataError({ type: 'folder', name: 'Projeto', description: 'a'.repeat(2001) }), /2.000 caracteres/)
})

test('renomear um arquivo preserva sua extensão e permite o limite já autorizado pelo servidor', () => {
 assert.equal(driveMetadataError({ type: 'file', originalName: 'Contrato.pdf', name: 'Contrato assinado.PDF' }), '')
 assert.equal(driveMetadataError({ type: 'file', originalName: 'Contrato.pdf', name: 'a'.repeat(196) + '.pdf' }), '')
 assert.match(driveMetadataError({ type: 'file', originalName: 'Contrato.pdf', name: 'Contrato.exe' }), /extensão original/)
 assert.match(driveMetadataError({ type: 'file', originalName: 'Contrato.pdf', name: 'Contrato' }), /extensão original/)
})

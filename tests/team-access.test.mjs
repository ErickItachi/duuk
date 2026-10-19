import assert from 'node:assert/strict'
import test from 'node:test'
import { teamAccountRestriction, teamPermissions } from '../supabase/functions/_shared/team-access.mjs'

const actor = { id: 'user-manager', role_id: 'manager', active: true, is_super_admin: false }
const administrator = { id: 'administrator', role_id: 'admin', active: true, is_super_admin: false }
const member = { id: 'member', role_id: 'crew', active: true, is_super_admin: false }
const rolePermissions = Object.entries({ manager: ['team', 'agenda'], admin: ['team', 'permissions', 'finance', 'agenda'], crew: ['agenda'] }).flatMap(([role_id, permissions]) => permissions.map(permission => ({ role_id, permission, allowed: true })))
const check = input => teamAccountRestriction({ actor, rolePermissions, ...input })

test('team alone cannot assign the Administrator role to itself or a new account', () => {
  assert.ok(check({ target: actor, assignedRoleId: 'admin' }))
  assert.ok(check({ assignedRoleId: 'admin' }))
  assert.equal(check({ target: member, assignedRoleId: 'crew' }), null)
  assert.equal(check({ assignedRoleId: 'crew' }), null)
})

test('team alone cannot take over, demote or reactivate a more privileged account', () => {
  // Password resets have no proposed role; email changes and demotions have one.
  assert.ok(check({ target: administrator }))
  assert.ok(check({ target: administrator, assignedRoleId: 'crew' }))
  assert.ok(check({ target: { ...administrator, active: false }, assignedRoleId: 'crew' }))
  assert.equal(check({ target: member }), null)
})

test('individual overrides prevail for both the actor and the managed account', () => {
  assert.ok(check({ target: member, userPermissions: [{ user_id: member.id, permission: 'finance', allowed: true }] }))
  assert.ok(check({ target: member, userPermissions: [{ user_id: actor.id, permission: 'agenda', allowed: false }] }))
  assert.equal(check({ target: member, userPermissions: [{ user_id: actor.id, permission: 'finance', allowed: true }, { user_id: member.id, permission: 'finance', allowed: true }] }), null)
  assert.ok(check({ target: administrator, userPermissions: [{ user_id: actor.id, permission: 'permissions', allowed: false }] }))
})

test('changing roles preserves existing individual grants in the scope check', () => {
  assert.ok(check({ target: member, assignedRoleId: 'crew', userPermissions: [{ user_id: member.id, permission: 'permissions', allowed: true }] }))
  assert.ok(check({ target: member, assignedRoleId: 'admin', userPermissions: [{ user_id: member.id, permission: 'permissions', allowed: false }] }))
})

test('permissions administrators retain authority over non-super accounts', () => {
  const userPermissions = [{ user_id: actor.id, permission: 'permissions', allowed: true }]
  assert.equal(check({ target: administrator, assignedRoleId: 'admin', userPermissions }), null)
  assert.ok(check({ target: { ...administrator, is_super_admin: true }, userPermissions }))
  assert.ok(check({ assignedRoleId: 'crew', proposedSuperAdmin: true, userPermissions }))
})

test('super administrator operations remain available and inactive actors are denied', () => {
  assert.equal(check({ actor: { ...actor, is_super_admin: true }, target: { ...administrator, is_super_admin: true }, proposedSuperAdmin: true }), null)
  assert.ok(check({ actor: { ...actor, active: false, is_super_admin: true }, target: member }))
  assert.ok(check({ actor: { ...actor, role_id: 'crew' }, target: member }))
})

test('CRM child grants require the parent and false grants do not grant scope', () => {
  const rows = [...rolePermissions, { role_id: 'crew', permission: 'crm.clients', allowed: true }, { role_id: 'crew', permission: 'finance', allowed: false }]
  assert.deepEqual([...teamPermissions(member, rows)], ['agenda'])
  assert.equal(check({ target: member, rolePermissions: rows }), null)
  assert.ok(check({ target: member, rolePermissions: [...rows, { role_id: 'crew', permission: 'crm', allowed: true }] }))
})

test('new grants default to denied and caller-supplied permission-like profile fields do not grant access', () => {
  assert.ok(check({ actor: { ...actor, permissions: true }, assignedRoleId: 'admin' }))
  assert.ok(check({ target: member, rolePermissions: [...rolePermissions, { role_id: 'crew', permission: 'future.module', allowed: true }] }))
  assert.ok(check({ actor: null, target: member }))
})


test('new billing and Spotify grants honor independent group access and explicit individual overrides', () => {
 const grants=[{role_id:'crew',permission:'billing',allowed:true},{role_id:'crew',permission:'spotify',allowed:false},{role_id:'crew',permission:'finance',allowed:false}]
 const input={profile:member,rolePermissions:grants,userPermissions:[{user_id:member.id,permission:'billing',allowed:false},{user_id:member.id,permission:'spotify',allowed:true}]}
 assert.deepEqual([...teamPermissions(input.profile,input.rolePermissions,input.userPermissions)],['spotify'])
 assert.deepEqual([...teamPermissions(input.profile,input.rolePermissions,[])],['billing'])
})

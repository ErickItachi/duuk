/** @typedef {{ id?: string, role_id: string, active?: boolean, is_super_admin?: boolean }} TeamProfile */
/** @typedef {{ role_id: string, permission: string, allowed: boolean }} RoleGrant */
/** @typedef {{ user_id: string, permission: string, allowed: boolean }} UserGrant */

// These rows come from the server, never from the request body. Keep the CRM
// parent rule aligned with duuk_private.member_permission in the database.
/**
 * @param {TeamProfile | null} profile
 * @param {RoleGrant[]} rolePermissions
 * @param {UserGrant[]} userPermissions
 * @returns {Set<string>}
 */
export function teamPermissions(profile, rolePermissions = [], userPermissions = []) {
  if (!profile) return new Set()
  const grants = new Map()
  for (const row of rolePermissions) if (row.role_id === profile.role_id) grants.set(row.permission, row.allowed === true)
  for (const row of userPermissions) if (row.user_id === profile.id) grants.set(row.permission, row.allowed === true)
  return new Set([...grants].filter(([permission, allowed]) => allowed && (!permission.startsWith('crm.') || grants.get('crm') === true)).map(([permission]) => permission))
}

// User administration does not itself grant authority to gain more access or
// take over a more privileged account by changing its email/password. Members
// with the separate permissions grant may administer non-super accounts.
/** @param {{ actor: TeamProfile | null, target?: TeamProfile | null, assignedRoleId?: string | null, proposedSuperAdmin?: boolean, rolePermissions?: RoleGrant[], userPermissions?: UserGrant[] }} input */
export function teamAccountRestriction({ actor, target = null, assignedRoleId = null, proposedSuperAdmin = false, rolePermissions = [], userPermissions = [] }) {
  if (!actor?.active) return 'Sua conta não tem acesso a esta ação.'
  if (actor.is_super_admin === true) return null
  if (target?.is_super_admin === true || proposedSuperAdmin === true) return 'Somente um super administrador pode alterar esta conta.'
  const own = teamPermissions(actor, rolePermissions, userPermissions)
  if (!own.has('team')) return 'Sem permissão para administrar usuários.'
  if (own.has('permissions')) return null
  // Evaluate inactive targets with their assigned grants too: reactivation or
  // resetting credentials must not bypass this boundary.
  const current = teamPermissions(target, rolePermissions, userPermissions)
  const proposed = assignedRoleId ? teamPermissions({ id: target?.id, role_id: assignedRoleId }, rolePermissions, userPermissions) : new Set()
  if ([...current, ...proposed].some(permission => !own.has(permission))) return 'Esta conta ou grupo possui acessos que você não pode administrar. Peça a um administrador com permissão de grupos e permissões.'
  return null
}

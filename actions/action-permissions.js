// Coach's Eye Action Library — Role-based permissions

export const ROLES = {
  COACH:       'coach',
  HEAD_COACH:  'head_coach',
  DOR:         'dor',
  COMMITTEE:   'committee',
  CHAIRPERSON: 'chairperson',
  ADMIN:       'admin',
  PARENT:      'parent',
  PLAYER:      'player',
};

// Higher roles include all permissions of lower roles
const ROLE_HIERARCHY = {
  admin:       ['coach', 'head_coach', 'dor', 'committee', 'chairperson'],
  chairperson: ['committee'],
  dor:         ['head_coach', 'coach'],
  head_coach:  ['coach'],
};

export function expandRole(role) {
  const expanded = new Set([role]);
  (ROLE_HIERARCHY[role] ?? []).forEach(r => expanded.add(r));
  return [...expanded];
}

export function hasPermission(contextRole, requiredPermissions) {
  if (!contextRole) return false;
  const effective = new Set(expandRole(contextRole));
  return requiredPermissions.some(r => effective.has(r));
}

export function describePermissions(perms) {
  return perms.join(' | ');
}

// Build the full permission matrix: category → roles → can/cannot
export function buildPermissionMatrix(actions) {
  const matrix = {};
  const allRoles = Object.values(ROLES).filter(r => !['parent', 'player'].includes(r));

  for (const action of actions) {
    matrix[action.id] = {
      name: action.name,
      category: action.category,
      perms: {},
    };
    for (const role of allRoles) {
      matrix[action.id].perms[role] = hasPermission(role, action.requiredPermissions);
    }
  }
  return matrix;
}

export function formatPermissionMatrix(matrix) {
  const roles = ['coach', 'head_coach', 'dor', 'committee', 'chairperson', 'admin'];
  const header = `| Action | ${roles.map(r => r.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')).join(' | ')} |`;
  const sep    = `|${'----|'.repeat(roles.length + 1)}`;

  const rows = Object.values(matrix).map(a => {
    const cells = roles.map(r => a.perms[r] ? '✅' : '—');
    return `| ${a.name} | ${cells.join(' | ')} |`;
  });

  return [header, sep, ...rows].join('\n');
}

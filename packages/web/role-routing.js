import { Role } from '../shared/roles.js';
import { hasAnyRole } from './auth-client.js';

export const ROUTE_RULES = Object.freeze({
  '/admin': [Role.ADMIN],
  '/manager': [Role.ADMIN, Role.MANAGER],
  '/self-service': [Role.ADMIN, Role.MANAGER, Role.EMPLOYEE],
});

export function canAccessRoute(pathname) {
  const requiredRoles = ROUTE_RULES[pathname];
  if (!requiredRoles) return true;
  return hasAnyRole(requiredRoles);
}

export function applyRoleVisibility(root = document) {
  const nodes = root.querySelectorAll('[data-required-roles]');

  nodes.forEach((node) => {
    const requiredRoles = node.dataset.requiredRoles
      .split(',')
      .map((role) => role.trim())
      .filter(Boolean);

    node.hidden = !hasAnyRole(requiredRoles);
  });
}

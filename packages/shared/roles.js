export const Role = Object.freeze({
  ADMIN: 'admin',
  MANAGER: 'manager',
  EMPLOYEE: 'employee',
});

export const ALL_ROLES = Object.freeze(Object.values(Role));

export function isRole(value) {
  return ALL_ROLES.includes(value);
}

export function assertRole(value) {
  if (!isRole(value)) {
    throw new Error(`Invalid role: ${value}`);
  }
  return value;
}

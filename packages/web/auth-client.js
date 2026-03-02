import { ALL_ROLES } from '../shared/roles.js';

const TOKEN_KEY = 'auth_token';

export async function login({ email, password, apiBaseUrl = '' }) {
  const response = await fetch(`${apiBaseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error('Invalid credentials');
  }

  const session = await response.json();
  setSession(session);
  return session;
}

export function setSession(session) {
  if (!session?.token || !Array.isArray(session?.roles)) {
    throw new Error('Session response must include token and roles');
  }

  if (session.roles.some((role) => !ALL_ROLES.includes(role))) {
    throw new Error('Session contains an unsupported role');
  }

  localStorage.setItem(TOKEN_KEY, JSON.stringify(session));
}

export function getSession() {
  const raw = localStorage.getItem(TOKEN_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.token || !Array.isArray(parsed?.roles)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
}

export function hasAnyRole(requiredRoles = []) {
  const session = getSession();
  const userRoles = session?.roles ?? [];
  return requiredRoles.some((role) => userRoles.includes(role));
}

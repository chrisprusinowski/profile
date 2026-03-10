import type { NextFunction, Request, Response } from 'express';
import { pool } from './db.js';

export const APP_ROLES = ['admin', 'executive', 'manager'] as const;
export type AppRole = (typeof APP_ROLES)[number];

export interface AppUser {
  email: string;
  role: AppRole;
  managerName: string | null;
  isActive: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: AppUser;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function forbidden(res: Response, message: string) {
  return res.status(403).json({ error: 'forbidden', message });
}

export function getCurrentUserEmail(req: Request): string {
  const fromHeader = req.header('x-demo-user-email');
  if (fromHeader?.trim()) return normalizeEmail(fromHeader);

  const fromQuery = typeof req.query.demoUserEmail === 'string' ? req.query.demoUserEmail : '';
  if (fromQuery?.trim()) return normalizeEmail(fromQuery);

  return 'admin@demo.com';
}

export async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const email = getCurrentUserEmail(req);
    const result = await pool.query(
      `SELECT email,
              role,
              manager_name AS "managerName",
              is_active AS "isActive"
       FROM app_users
       WHERE lower(email) = lower($1)
       LIMIT 1`,
      [email],
    );

    if (!result.rows[0]) {
      res.status(401).json({ error: 'unauthorized', message: `No app user found for ${email}` });
      return;
    }

    if (!result.rows[0].isActive) {
      res.status(403).json({ error: 'forbidden', message: `User ${email} is inactive` });
      return;
    }

    req.user = result.rows[0] as AppUser;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(req: AuthenticatedRequest, res: Response, allowed: AppRole[]): boolean {
  const role = req.user?.role;
  if (!role || !allowed.includes(role)) {
    forbidden(res, `Role ${role ?? 'unknown'} cannot perform this action`);
    return false;
  }
  return true;
}

export function getManagerScopeName(user: AppUser): string | null {
  if (user.role !== 'manager') return null;
  if (user.managerName && user.managerName.trim()) return user.managerName.trim();
  return null;
}

export async function assertEmployeeInScope(user: AppUser, employeeId: string): Promise<boolean> {
  if (user.role !== 'manager') return true;
  const managerName = getManagerScopeName(user);
  if (!managerName) return false;

  const result = await pool.query(
    `SELECT 1
     FROM employees
     WHERE id = $1
       AND lower(manager) = lower($2)
     LIMIT 1`,
    [employeeId, managerName],
  );

  return Boolean(result.rows[0]);
}

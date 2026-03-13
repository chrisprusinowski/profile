import { Router } from 'express';
import { z } from 'zod';
import { APP_ROLES, requireRole, type AuthenticatedRequest } from '../auth.js';
import { logAuditEvent } from '../audit.js';
import { pool } from '../db.js';

export const usersRouter = Router();

const createUserSchema = z.object({
  email: z.string().email(),
  role: z.enum(APP_ROLES),
  executiveName: z.string().trim().max(255).optional().nullable(),
  executiveEmail: z.string().trim().email().optional().nullable(),
  isActive: z.boolean().optional(),
});

const updateUserSchema = z.object({
  role: z.enum(APP_ROLES).optional(),
  executiveName: z.string().trim().max(255).optional().nullable(),
  executiveEmail: z.string().trim().email().optional().nullable(),
  isActive: z.boolean().optional(),
});

usersRouter.get('/me', (req: AuthenticatedRequest, res) => {
  res.json({ data: req.user });
});

usersRouter.get('/', async (req: AuthenticatedRequest, res, next) => {
  if (!requireRole(req, res, ['admin'])) return;

  try {
    const result = await pool.query(
      `SELECT email,
              role,
              executive_name AS "executiveName",
              executive_email AS "executiveEmail",
              is_active AS "isActive",
              created_at AS "createdAt",
              updated_at AS "updatedAt"
       FROM app_users
       ORDER BY email ASC`,
    );

    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

usersRouter.post('/', async (req: AuthenticatedRequest, res, next) => {
  if (!requireRole(req, res, ['admin'])) return;
  try {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const payload = parsed.data;
    const result = await pool.query(
      `INSERT INTO app_users (email, role, executive_name, executive_email, is_active)
       VALUES (lower($1), $2, NULLIF($3, ''), NULLIF(lower($4), ''), COALESCE($5, true))
       RETURNING email,
                 role,
                 executive_name AS "executiveName",
                 executive_email AS "executiveEmail",
                 is_active AS "isActive",
                 created_at AS "createdAt",
                 updated_at AS "updatedAt"`,
      [payload.email, payload.role, payload.executiveName ?? '', payload.executiveEmail ?? '', payload.isActive],
    );

    await logAuditEvent({
      actionType: 'user.role_changed',
      actorEmail: req.user!.email,
      targetEntity: 'app_users',
      targetId: result.rows[0].email,
      newValues: result.rows[0]
    });

    res.status(201).json({ data: result.rows[0] });
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'User already exists for this email' });
      return;
    }
    next(error);
  }
});

usersRouter.put('/:email', async (req: AuthenticatedRequest, res, next) => {
  if (!requireRole(req, res, ['admin'])) return;

  try {
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const { role, executiveName, executiveEmail, isActive } = parsed.data;
    const result = await pool.query(
      `UPDATE app_users
       SET role = COALESCE($1, role),
           executive_name = CASE WHEN $2::text IS NULL THEN executive_name ELSE NULLIF($2, '') END,
           executive_email = CASE WHEN $3::text IS NULL THEN executive_email ELSE NULLIF(lower($3), '') END,
           is_active = COALESCE($4, is_active),
           updated_at = NOW()
       WHERE lower(email) = lower($5)
       RETURNING email,
                 role,
                 executive_name AS "executiveName",
                 executive_email AS "executiveEmail",
                 is_active AS "isActive",
                 created_at AS "createdAt",
                 updated_at AS "updatedAt"`,
      [role ?? null, executiveName ?? null, executiveEmail ?? null, isActive ?? null, req.params.email],
    );

    if (!result.rows[0]) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    await logAuditEvent({
      actionType: 'user.role_changed',
      actorEmail: req.user!.email,
      targetEntity: 'app_users',
      targetId: result.rows[0].email,
      newValues: result.rows[0]
    });

    res.json({ data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

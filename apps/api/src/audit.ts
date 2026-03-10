import { pool } from './db.js';

export type AuditAction =
  | 'recommendation.updated'
  | 'recommendation.submitted'
  | 'recommendation.locked'
  | 'recommendation.reopened'
  | 'cycle.updated'
  | 'employee.imported'
  | 'pay_range.imported'
  | 'user.role_changed'
  | 'employee.created'
  | 'employee.updated'
  | 'employee.deleted';

export async function logAuditEvent(input: {
  actionType: AuditAction;
  actorEmail: string;
  targetEntity: string;
  targetId: string;
  oldValues?: unknown;
  newValues?: unknown;
  metadata?: unknown;
}) {
  await pool.query(
    `INSERT INTO audit_log (action_type, actor_email, target_entity, target_id, old_values, new_values, metadata)
     VALUES ($1, lower($2), $3, $4, $5::jsonb, $6::jsonb, $7::jsonb)`,
    [
      input.actionType,
      input.actorEmail,
      input.targetEntity,
      input.targetId,
      input.oldValues ? JSON.stringify(input.oldValues) : null,
      input.newValues ? JSON.stringify(input.newValues) : null,
      input.metadata ? JSON.stringify(input.metadata) : null
    ]
  );
}

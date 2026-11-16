import { PoolClient } from 'pg';
import { pool } from '../db';
import { logger } from '../utils/logger';

export interface AuditEntry {
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  details?: unknown;
  ip?: string | null;
}

export async function audit(entry: AuditEntry, client?: PoolClient): Promise<void> {
  const runner = client ?? pool;
  try {
    await runner.query(
      `INSERT INTO audit_log (actor_id, actor_role, action, target_type, target_id, details, ip)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [
        entry.actorId ?? null,
        entry.actorRole ?? null,
        entry.action,
        entry.targetType ?? null,
        entry.targetId ?? null,
        JSON.stringify(entry.details ?? {}),
        entry.ip ?? null,
      ],
    );
  } catch (err) {
    // Auditing must never break the request path, but must be loud.
    logger.error({ err, entry }, 'failed to write audit log');
  }
}

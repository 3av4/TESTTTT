/**
 * سجل التدقيق — كل إجراء إداري (من الموقع أو البوت) يُسجَّل هنا.
 */
import { query, queryOne } from "../db.js";
import { toBigNumber } from "../utils.js";

export interface AuditEntry {
  id: number;
  actorId: number | null;
  actorLabel: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: Record<string, unknown>;
  ip: string | null;
  createdAt: string;
}

export async function audit(entry: {
  actorId?: number | null;
  actorLabel?: string;
  action: string;
  targetType?: string | null;
  targetId?: string | number | null;
  details?: Record<string, unknown>;
  ip?: string | null;
}): Promise<void> {
  await query(
    `INSERT INTO audit_logs (actor_id, actor_label, action, target_type, target_id, details, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      entry.actorId ?? null,
      (entry.actorLabel ?? "").slice(0, 120),
      entry.action.slice(0, 100),
      entry.targetType ?? null,
      entry.targetId === null || entry.targetId === undefined ? null : String(entry.targetId),
      JSON.stringify(entry.details ?? {}),
      entry.ip ?? null,
    ],
  ).catch(() => undefined);
}

export async function listAudit(options?: { limit?: number; offset?: number; action?: string }): Promise<AuditEntry[]> {
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);
  const rows = await query<{
    id: string;
    actor_id: string | null;
    actor_label: string;
    action: string;
    target_type: string | null;
    target_id: string | null;
    details: Record<string, unknown>;
    ip: string | null;
    created_at: string;
  }>(
    `SELECT * FROM audit_logs
     WHERE ($3::text IS NULL OR action = $3)
     ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    [limit, options?.offset ?? 0, options?.action ?? null],
  );
  return rows.map((row) => ({
    id: toBigNumber(row.id),
    actorId: row.actor_id ? toBigNumber(row.actor_id) : null,
    actorLabel: row.actor_label,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    details: row.details ?? {},
    ip: row.ip,
    createdAt: row.created_at,
  }));
}

export async function countAudit(action?: string): Promise<number> {
  const row = await queryOne<{ count: string }>(
    "SELECT count(*) AS count FROM audit_logs WHERE ($1::text IS NULL OR action = $1)",
    [action ?? null],
  );
  return toBigNumber(row?.count);
}

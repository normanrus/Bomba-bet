import { PoolClient } from 'pg';
import { badRequest } from '../utils/errors';

export type LedgerReason =
  | 'signup_bonus'
  | 'daily_bonus'
  | 'prediction_stake'
  | 'prediction_payout'
  | 'prediction_refund'
  | 'admin_adjust'
  | 'prize_reserve'
  | 'prize_refund'
  | 'manual';

export interface BalanceChange {
  userId: string;
  delta: number; // positive credit, negative debit
  reason: LedgerReason;
  refType?: string;
  refId?: string;
  note?: string;
  actorId?: string | null;
  /** When true, a negative delta that would go below zero throws instead of clamping. */
  allowNegative?: boolean;
}

/**
 * Applies a balance change atomically and appends an immutable ledger row.
 * MUST be called inside a transaction. The user row is locked FOR UPDATE so
 * concurrent requests cannot double-spend the same balance.
 */
export async function applyBalanceChange(
  client: PoolClient,
  change: BalanceChange,
): Promise<{ balanceBefore: number; balanceAfter: number }> {
  const locked = await client.query<{ balance: string }>(
    'SELECT balance FROM users WHERE id = $1 FOR UPDATE',
    [change.userId],
  );
  if (locked.rowCount === 0) throw badRequest('Пользователь не найден');

  const balanceBefore = Number(locked.rows[0].balance);
  const balanceAfter = balanceBefore + change.delta;

  if (balanceAfter < 0 && !change.allowNegative) {
    throw badRequest('Недостаточно виртуальных очков на балансе');
  }

  await client.query('UPDATE users SET balance = $2, updated_at = now() WHERE id = $1', [
    change.userId,
    balanceAfter,
  ]);
  await client.query(
    `INSERT INTO ledger (user_id, delta, balance_after, reason, ref_type, ref_id, note, actor_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      change.userId,
      change.delta,
      balanceAfter,
      change.reason,
      change.refType ?? null,
      change.refId ?? null,
      change.note ?? null,
      change.actorId ?? null,
    ],
  );

  return { balanceBefore, balanceAfter };
}

/** Credits a bonus and records it in bonus_grants (used for auditable random bonuses). */
export async function grantBonus(
  client: PoolClient,
  opts: { userId: string; amount: number; kind: string; details?: unknown; reason: LedgerReason },
): Promise<number> {
  await client.query(
    `INSERT INTO bonus_grants (user_id, amount, kind, details) VALUES ($1, $2, $3, $4::jsonb)`,
    [opts.userId, opts.amount, opts.kind, JSON.stringify(opts.details ?? {})],
  );
  const res = await applyBalanceChange(client, {
    userId: opts.userId,
    delta: opts.amount,
    reason: opts.reason,
    refType: 'bonus',
    note: opts.kind,
  });
  return res.balanceAfter;
}

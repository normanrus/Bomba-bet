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

/**
 * Two buckets back every balance:
 *  - `bonus`        — free points (signup/daily bonuses, admin gifts). Not cashable.
 *  - `withdrawable` — points won from predictions. Only these can become a prize.
 *
 * The product rule is simple: free points can never be withdrawn. Everything in
 * this file exists to keep that rule true no matter how the balance is moved.
 */
export type Bucket = 'bonus' | 'withdrawable';

/** Where a credit lands when the caller does not pin it explicitly. */
const CREDIT_BUCKET: Partial<Record<LedgerReason, Bucket>> = {
  prediction_payout: 'withdrawable',
  prize_refund: 'withdrawable',
};

/**
 * How a debit is charged.
 *  - `bonus_first`  — spend free points first, then cashable ones (a stake).
 *  - `withdrawable` — charge cashable points only (a payout must be earned).
 */
const DEBIT_POLICY: Partial<Record<LedgerReason, 'bonus_first' | Bucket>> = {
  prediction_stake: 'bonus_first',
  prize_reserve: 'withdrawable',
};

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
  /**
   * Exact cashable movement. Used for refunds, where the split must mirror the
   * original stake rather than follow a fixed policy.
   */
  withdrawableDelta?: number;
}

export interface BalanceResult {
  balanceBefore: number;
  balanceAfter: number;
  withdrawableBefore: number;
  withdrawableAfter: number;
  /** Signed movement of the cashable bucket caused by this change. */
  withdrawableDelta: number;
}

interface Split {
  balanceDelta: number;
  withdrawableDelta: number;
}

/** Resolves how a change splits between the free and cashable buckets. */
export function resolveSplit(
  change: BalanceChange,
  balanceBefore: number,
  withdrawableBefore: number,
): Split {
  const delta = change.delta;

  if (change.withdrawableDelta !== undefined) {
    return { balanceDelta: delta, withdrawableDelta: change.withdrawableDelta };
  }

  if (delta >= 0) {
    const bucket = CREDIT_BUCKET[change.reason] ?? 'bonus';
    return { balanceDelta: delta, withdrawableDelta: bucket === 'withdrawable' ? delta : 0 };
  }

  const policy = DEBIT_POLICY[change.reason] ?? 'bonus_first';
  if (policy === 'withdrawable') {
    return { balanceDelta: delta, withdrawableDelta: delta };
  }
  if (policy === 'bonus') {
    return { balanceDelta: delta, withdrawableDelta: 0 };
  }

  // bonus_first: drain the free points first and touch cashable ones only for
  // the remainder, so a stake never burns withdrawable points while free
  // points are still available.
  const freeBefore = balanceBefore - withdrawableBefore;
  const charged = Math.max(0, -delta - freeBefore);
  return { balanceDelta: delta, withdrawableDelta: charged === 0 ? 0 : -charged };
}

/**
 * Applies a balance change atomically and appends an immutable ledger row.
 * MUST be called inside a transaction. The user row is locked FOR UPDATE so
 * concurrent requests cannot double-spend the same balance.
 */
export async function applyBalanceChange(
  client: PoolClient,
  change: BalanceChange,
): Promise<BalanceResult> {
  const locked = await client.query<{ balance: string; withdrawable_balance: string }>(
    'SELECT balance, withdrawable_balance FROM users WHERE id = $1 FOR UPDATE',
    [change.userId],
  );
  if (locked.rowCount === 0) throw badRequest('Пользователь не найден');

  const balanceBefore = Number(locked.rows[0].balance);
  const withdrawableBefore = Number(locked.rows[0].withdrawable_balance);

  const split = resolveSplit(change, balanceBefore, withdrawableBefore);
  const balanceAfter = balanceBefore + split.balanceDelta;
  const withdrawableAfter = withdrawableBefore + split.withdrawableDelta;

  if (balanceAfter < 0 && !change.allowNegative) {
    throw badRequest('Недостаточно виртуальных очков на балансе');
  }
  if (withdrawableAfter < 0) {
    throw badRequest('Недостаточно выводимых очков: бесплатные очки вывести нельзя');
  }

  await client.query(
    'UPDATE users SET balance = $2, withdrawable_balance = $3, updated_at = now() WHERE id = $1',
    [change.userId, balanceAfter, withdrawableAfter],
  );
  await client.query(
    `INSERT INTO ledger (user_id, delta, balance_after, withdrawable_after, reason, ref_type, ref_id, note, actor_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      change.userId,
      split.balanceDelta,
      balanceAfter,
      withdrawableAfter,
      change.reason,
      change.refType ?? null,
      change.refId ?? null,
      change.note ?? null,
      change.actorId ?? null,
    ],
  );

  return {
    balanceBefore,
    balanceAfter,
    withdrawableBefore,
    withdrawableAfter,
    withdrawableDelta: split.withdrawableDelta,
  };
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

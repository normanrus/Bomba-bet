import { PoolClient } from 'pg';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors';
import { applyBalanceChange } from './economy';
import { getSettings } from './settings';

export type PrizeStatus = 'pending' | 'approved' | 'issued' | 'rejected' | 'cancelled';

export interface CreatePrizeInput {
  userId: string;
  amount: number;
  telegramUsername: string;
  userNote?: string;
}

/**
 * A prize request debits the user's virtual balance immediately ("reserve") so
 * the same winnings cannot be claimed twice. Rejection refunds the amount.
 */
export async function createPrizeRequest(client: PoolClient, input: CreatePrizeInput) {
  const settings = await getSettings();
  if (!settings['prizes.enabled']) throw conflict('Заявки на призы временно отключены');

  const amount = Math.floor(input.amount);
  if (amount < settings['prizes.minRequest']) {
    throw badRequest(`Минимальная сумма заявки — ${settings['prizes.minRequest']} очков`);
  }

  const tg = input.telegramUsername.trim().replace(/^@/, '');
  if (!/^[A-Za-z0-9_]{5,32}$/.test(tg)) {
    throw badRequest('Укажите корректный Telegram @username (5–32 символа: латиница, цифры, _)');
  }

  // Fund cap: sum of amounts reserved but not yet rejected/cancelled.
  const fund = await client.query<{ used: string }>(
    `SELECT COALESCE(sum(amount), 0)::text AS used FROM prize_requests
      WHERE status IN ('pending','approved','issued')`,
  );
  if (Number(fund.rows[0].used) + amount > settings['prizes.maxFund']) {
    throw conflict('Достигнут общий лимит призового фонда. Обратитесь к администратору');
  }

  const openReq = await client.query(
    `SELECT 1 FROM prize_requests WHERE user_id = $1 AND status IN ('pending','approved') LIMIT 1`,
    [input.userId],
  );
  if (openReq.rowCount) throw conflict('У вас уже есть заявка в обработке');

  await applyBalanceChange(client, {
    userId: input.userId,
    delta: -amount,
    reason: 'prize_reserve',
    refType: 'prize',
    note: 'Резерв под заявку на приз',
  });

  const inserted = await client.query(
    `INSERT INTO prize_requests (user_id, amount, telegram_username, user_note)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [input.userId, amount, tg, input.userNote ?? null],
  );
  return inserted.rows[0];
}

export async function processPrizeRequest(
  client: PoolClient,
  opts: {
    prizeId: string;
    action: 'approve' | 'issue' | 'reject' | 'cancel';
    adminId: string;
    adminNote?: string;
    rejectReason?: string;
  },
) {
  const row = await client.query<{
    id: string;
    user_id: string;
    amount: string;
    status: PrizeStatus;
  }>('SELECT id, user_id, amount, status FROM prize_requests WHERE id = $1 FOR UPDATE', [opts.prizeId]);
  if (row.rowCount === 0) throw notFound('Заявка не найдена');
  const prize = row.rows[0];
  const amount = Number(prize.amount);

  const transitions: Record<string, { from: PrizeStatus[]; to: PrizeStatus }> = {
    approve: { from: ['pending'], to: 'approved' },
    issue: { from: ['pending', 'approved'], to: 'issued' },
    reject: { from: ['pending', 'approved'], to: 'rejected' },
    cancel: { from: ['pending', 'approved'], to: 'cancelled' },
  };
  const t = transitions[opts.action];
  if (!t.from.includes(prize.status)) {
    throw conflict(`Недопустимый переход: ${prize.status} → ${t.to}`);
  }

  // Only the request owner may cancel; admins approve/issue/reject.
  if (opts.action === 'cancel' && opts.adminId !== prize.user_id) {
    throw forbidden('Отменить заявку может только её владелец');
  }

  if (opts.action === 'reject' || opts.action === 'cancel') {
    // Refund the reserved amount exactly once (guarded by the status transition).
    await applyBalanceChange(client, {
      userId: prize.user_id,
      delta: amount,
      reason: 'prize_refund',
      refType: 'prize',
      refId: prize.id,
      note: opts.action === 'reject' ? 'Отклонение заявки: возврат очков' : 'Отмена заявки: возврат очков',
    });
  }

  const updated = await client.query(
    `UPDATE prize_requests
        SET status = $2,
            admin_note = COALESCE($3, admin_note),
            reject_reason = COALESCE($4, reject_reason),
            processed_at = now(),
            processed_by = $5
      WHERE id = $1
      RETURNING *`,
    [prize.id, t.to, opts.adminNote ?? null, opts.rejectReason ?? null, opts.adminId],
  );
  return updated.rows[0];
}

export async function prizeFundUsage(): Promise<{ used: number; issued: number }> {
  const { one } = await import('../db');
  const row = await one<{ used: string; issued: string }>(
    `SELECT
       COALESCE(sum(amount) FILTER (WHERE status IN ('pending','approved','issued')), 0)::text AS used,
       COALESCE(sum(amount) FILTER (WHERE status = 'issued'), 0)::text                    AS issued
     FROM prize_requests`,
  );
  return { used: Number(row?.used ?? 0), issued: Number(row?.issued ?? 0) };
}

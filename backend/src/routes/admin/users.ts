import { Router } from 'express';
import { z } from 'zod';
import { many, one, withTransaction } from '../../db';
import { asyncHandler } from '../../middleware/error';
import { validate } from '../../middleware/validate';
import { audit } from '../../services/audit';
import { applyBalanceChange } from '../../services/economy';
import { getUserStats, mapUser } from '../../services/users';
import { badRequest, notFound } from '../../utils/errors';
import { mapPrediction, PREDICTION_SELECT } from '../../services/predictions';
import { mapPrize } from '../prizes';

const router = Router();

/** GET /api/admin/users — search and list users. */
router.get(
  '/',
  validate(
    z.object({
      q: z.string().trim().max(64).optional(),
      status: z.enum(['all', 'active', 'blocked']).default('all'),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    }),
    'query',
  ),
  asyncHandler(async (req, res) => {
    const { q, status, limit, offset } = req.query as unknown as {
      q?: string;
      status: string;
      limit: number;
      offset: number;
    };
    const where: string[] = ["u.role = 'user'"];
    const params: unknown[] = [];
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      where.push(`u.username_lower LIKE $${params.length}`);
    }
    if (status !== 'all') {
      params.push(status);
      where.push(`u.status = $${params.length}`);
    }
    const filterParams = [...params];
    params.push(limit, offset);

    const rows = await many(
      `SELECT u.id, u.username, u.avatar_seed, u.avatar_url, u.balance, u.role, u.status,
              u.telegram_username, u.created_at, u.last_seen_at,
              count(p.id) FILTER (WHERE p.status = 'won')     AS wins,
              count(p.id) FILTER (WHERE p.status = 'lost')    AS losses,
              count(p.id) FILTER (WHERE p.status = 'pending') AS pending_predictions
         FROM users u LEFT JOIN predictions p ON p.user_id = u.id
        WHERE ${where.join(' AND ')}
        GROUP BY u.id
        ORDER BY u.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    const total = await one<{ c: string }>(
      `SELECT count(*)::text AS c FROM users u WHERE ${where.join(' AND ')}`,
      filterParams,
    );

    res.json({
      total: Number(total?.c ?? 0),
      users: rows.map((r) => ({
        ...mapUser(r),
        lastSeenAt: r.last_seen_at,
        wins: Number(r.wins),
        losses: Number(r.losses),
        pendingPredictions: Number(r.pending_predictions),
      })),
    });
  }),
);

/** GET /api/admin/users/:id — full profile with history. */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const user = await one<Record<string, unknown>>(
      `SELECT id, username, avatar_seed, avatar_url, balance, role, status,
              telegram_username, created_at, last_seen_at
         FROM users WHERE id = $1`,
      [req.params.id],
    );
    if (!user) throw notFound('Пользователь не найден');
    const stats = await getUserStats(req.params.id);
    const predictions = await many(
      `${PREDICTION_SELECT} WHERE p.user_id = $1 ORDER BY p.placed_at DESC LIMIT 50`,
      [req.params.id],
    );
    const ledger = await many(
      `SELECT id, delta, balance_after, reason, note, ref_type, ref_id, created_at
         FROM ledger WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.params.id],
    );
    const prizes = await many(
      `SELECT * FROM prize_requests WHERE user_id = $1 ORDER BY requested_at DESC LIMIT 50`,
      [req.params.id],
    );
    res.json({
      user: { ...mapUser(user), stats, lastSeenAt: user.last_seen_at },
      predictions: predictions.map(mapPrediction),
      ledger: ledger.map((l) => ({
        id: Number(l.id),
        delta: Number(l.delta),
        balanceAfter: Number(l.balance_after),
        reason: l.reason,
        note: l.note,
        createdAt: l.created_at,
      })),
      prizes: prizes.map(mapPrize),
    });
  }),
);

/** POST /api/admin/users/:id/status — block or unblock. */
router.post(
  '/:id/status',
  validate(
    z.object({
      status: z.enum(['active', 'blocked']),
      reason: z.string().trim().max(300).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user!.id) throw badRequest('Нельзя заблокировать собственный аккаунт');
    const { status, reason } = req.body;
    const updated = await one(
      `UPDATE users SET status = $2, updated_at = now() WHERE id = $1 AND role = 'user'
        RETURNING id, username, status`,
      [req.params.id, status],
    );
    if (!updated) throw notFound('Пользователь не найден');

    if (status === 'blocked') {
      await one(
        'UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL RETURNING id',
        [req.params.id],
      );
    }
    await audit({
      actorId: req.user!.id,
      actorRole: 'admin',
      action: status === 'blocked' ? 'admin.user.block' : 'admin.user.unblock',
      targetType: 'user',
      targetId: req.params.id,
      details: { reason: reason ?? null },
      ip: req.ip ?? null,
    });
    res.json({ user: updated });
  }),
);

/** POST /api/admin/users/:id/balance — manual balance correction with a mandatory reason. */
router.post(
  '/:id/balance',
  validate(
    z.object({
      delta: z.coerce.number().int().refine((v) => v !== 0, 'Изменение не может быть нулевым'),
      reason: z.string().trim().min(3, 'Укажите причину').max(300),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { delta, reason } = req.body;
    const result = await withTransaction(async (client) => {
      const target = await client.query('SELECT id FROM users WHERE id = $1', [req.params.id]);
      if (target.rowCount === 0) throw notFound('Пользователь не найден');
      const change = await applyBalanceChange(client, {
        userId: req.params.id,
        delta,
        reason: 'admin_adjust',
        refType: 'admin',
        refId: req.user!.id,
        note: reason,
        actorId: req.user!.id,
      });
      await audit(
        {
          actorId: req.user!.id,
          actorRole: 'admin',
          action: 'admin.user.balance_adjust',
          targetType: 'user',
          targetId: req.params.id,
          details: {
            delta,
            reason,
            balanceBefore: change.balanceBefore,
            balanceAfter: change.balanceAfter,
          },
          ip: req.ip ?? null,
        },
        client,
      );
      return change;
    });
    res.json(result);
  }),
);

export default router;

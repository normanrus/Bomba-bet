import { Router } from 'express';
import { z } from 'zod';
import { many, withTransaction } from '../../db';
import { asyncHandler } from '../../middleware/error';
import { validate } from '../../middleware/validate';
import { audit } from '../../services/audit';
import { processPrizeRequest, prizeFundUsage } from '../../services/prizes';
import { badRequest } from '../../utils/errors';
import { mapPrize } from '../prizes';

const router = Router();

/** GET /api/admin/prizes — queue with user context. */
router.get(
  '/',
  validate(
    z.object({
      status: z
        .enum(['all', 'pending', 'approved', 'issued', 'rejected', 'cancelled'])
        .default('all'),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    }),
    'query',
  ),
  asyncHandler(async (req, res) => {
    const { status, limit, offset } = req.query as unknown as {
      status: string;
      limit: number;
      offset: number;
    };
    const params: unknown[] = [];
    let where = '';
    if (status !== 'all') {
      params.push(status);
      where = `WHERE pr.status = $${params.length}`;
    }
    params.push(limit, offset);
    const rows = await many(
      `SELECT pr.*, u.username, u.id AS uid, u.balance, u.withdrawable_balance, u.telegram_username,
              (SELECT count(*) FROM predictions p WHERE p.user_id = u.id AND p.status = 'won')       AS wins,
              (SELECT COALESCE(sum(p.payout), 0) FROM predictions p WHERE p.user_id = u.id AND p.status = 'won') AS total_won
         FROM prize_requests pr
         JOIN users u ON u.id = pr.user_id
         ${where}
        ORDER BY pr.requested_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const usage = await prizeFundUsage();
    res.json({
      prizes: rows.map((r) => ({
        ...mapPrize(r),
        username: r.username,
        userId: r.uid,
        userBalance: Number(r.balance),
        userWithdrawable: Number(r.withdrawable_balance),
        userTelegram: r.telegram_username,
        userWins: Number(r.wins),
        userTotalWon: Number(r.total_won),
      })),
      fund: usage,
    });
  }),
);

/** POST /api/admin/prizes/:id/:action — approve, issue or reject. */
router.post(
  '/:id/:action',
  validate(
    z.object({
      adminNote: z.string().trim().max(500).optional(),
      rejectReason: z.string().trim().max(500).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const action = req.params.action;
    if (!['approve', 'issue', 'reject'].includes(action)) {
      throw badRequest('Неизвестное действие');
    }
    if (action === 'reject' && !req.body.rejectReason) {
      throw badRequest('Укажите причину отклонения');
    }
    const prize = await withTransaction((client) =>
      processPrizeRequest(client, {
        prizeId: req.params.id,
        action: action as 'approve' | 'issue' | 'reject',
        adminId: req.user!.id,
        adminNote: req.body.adminNote,
        rejectReason: req.body.rejectReason,
      }),
    );
    await audit({
      actorId: req.user!.id,
      actorRole: 'admin',
      action: `admin.prize.${action}`,
      targetType: 'prize',
      targetId: req.params.id,
      details: {
        amount: Number(prize.amount),
        adminNote: req.body.adminNote,
        rejectReason: req.body.rejectReason,
      },
      ip: req.ip ?? null,
    });
    res.json({ prize: mapPrize(prize) });
  }),
);

export default router;

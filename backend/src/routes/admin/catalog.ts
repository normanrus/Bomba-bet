import { Router } from 'express';
import { z } from 'zod';
import { one } from '../../db';
import { asyncHandler } from '../../middleware/error';
import { validate } from '../../middleware/validate';
import { audit } from '../../services/audit';
import { notFound } from '../../utils/errors';

const router = Router();

/** PATCH /api/admin/catalog/outcomes/:id — edit odds / label / availability. */
router.patch(
  '/outcomes/:id',
  validate(
    z.object({
      label: z.string().trim().min(1).max(120).optional(),
      odds: z.coerce.number().min(1.01).max(1000).optional(),
      isActive: z.boolean().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const b = req.body;
    const updated = await one(
      `UPDATE outcomes SET
         label     = COALESCE($2, label),
         odds      = COALESCE($3, odds),
         is_active = COALESCE($4, is_active)
       WHERE id = $1
       RETURNING id, market_id, label, odds, is_active`,
      [req.params.id, b.label ?? null, b.odds ?? null, b.isActive ?? null],
    );
    if (!updated) throw notFound('Вариант прогноза не найден');
    await audit({
      actorId: req.user!.id,
      actorRole: 'admin',
      action: 'admin.outcome.update',
      targetType: 'outcome',
      targetId: req.params.id,
      details: b,
      ip: req.ip ?? null,
    });
    res.json({ outcome: updated });
  }),
);

/** DELETE /api/admin/catalog/markets/:id — delete, or deactivate when predictions exist. */
router.delete(
  '/markets/:id',
  asyncHandler(async (req, res) => {
    const used = await one<{ c: string }>(
      `SELECT count(*)::text AS c FROM predictions WHERE market_id = $1 AND status = 'pending'`,
      [req.params.id],
    );
    const hasPending = Number(used?.c ?? 0) > 0;
    if (hasPending) {
      await one('UPDATE markets SET is_active = false WHERE id = $1 RETURNING id', [req.params.id]);
    } else {
      await one('DELETE FROM markets WHERE id = $1 RETURNING id', [req.params.id]);
    }
    await audit({
      actorId: req.user!.id,
      actorRole: 'admin',
      action: hasPending ? 'admin.market.deactivate' : 'admin.market.delete',
      targetType: 'market',
      targetId: req.params.id,
      ip: req.ip ?? null,
    });
    res.json({ ok: true, deactivated: hasPending });
  }),
);

export default router;

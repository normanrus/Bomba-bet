import { Router } from 'express';
import { z } from 'zod';
import { many } from '../../db';
import { asyncHandler } from '../../middleware/error';
import { validate } from '../../middleware/validate';

const router = Router();

/** GET /api/admin/audit — administrative action log. */
router.get(
  '/',
  validate(
    z.object({
      limit: z.coerce.number().int().min(1).max(500).default(100),
      offset: z.coerce.number().int().min(0).default(0),
      action: z.string().trim().max(64).optional(),
    }),
    'query',
  ),
  asyncHandler(async (req, res) => {
    const { limit, offset, action } = req.query as unknown as {
      limit: number;
      offset: number;
      action?: string;
    };
    const params: unknown[] = [];
    let where = '';
    if (action) {
      params.push(`${action}%`);
      where = `WHERE a.action LIKE $${params.length}`;
    }
    params.push(limit, offset);
    const rows = await many(
      `SELECT a.id, a.action, a.target_type, a.target_id, a.details, a.ip, a.created_at,
              u.username AS actor_username, a.actor_role
         FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
         ${where}
        ORDER BY a.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    res.json({
      entries: rows.map((r) => ({
        id: Number(r.id),
        action: r.action,
        actorUsername: r.actor_username,
        actorRole: r.actor_role,
        targetType: r.target_type,
        targetId: r.target_id,
        details: r.details,
        ip: r.ip,
        createdAt: r.created_at,
      })),
    });
  }),
);

export default router;

import { Router } from 'express';
import { many, one } from '../../db';
import { asyncHandler } from '../../middleware/error';
import { prizeFundUsage } from '../../services/prizes';
import { getSettings } from '../../services/settings';

const router = Router();

/** GET /api/admin/stats — dashboard totals. */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const s = await getSettings();
    const totals = await one<Record<string, string>>(
      `SELECT
         (SELECT count(*) FROM users WHERE role = 'user')::text                           AS users,
         (SELECT count(*) FROM users WHERE role = 'user' AND status = 'blocked')::text     AS blocked_users,
         (SELECT count(*) FROM users WHERE last_seen_at > now() - interval '7 days')::text AS active_7d,
         (SELECT count(*) FROM users WHERE last_seen_at > now() - interval '1 day')::text  AS active_24h,
         (SELECT COALESCE(sum(balance), 0) FROM users WHERE role = 'user')::text           AS total_balance,
         (SELECT count(*) FROM predictions)::text                                           AS predictions,
         (SELECT count(*) FROM predictions WHERE status = 'won')::text                      AS won,
         (SELECT count(*) FROM predictions WHERE status = 'lost')::text                     AS lost,
         (SELECT count(*) FROM predictions WHERE status = 'pending')::text                  AS pending,
         (SELECT count(*) FROM events)::text                                                AS events,
         (SELECT count(*) FROM events WHERE status = 'upcoming')::text                      AS events_upcoming,
         (SELECT count(*) FROM prize_requests WHERE status = 'pending')::text               AS prizes_pending,
         (SELECT count(*) FROM prize_requests WHERE status = 'issued')::text                AS prizes_issued`,
    );
    const usage = await prizeFundUsage();
    const recent = await many(
      `SELECT a.id, a.action, a.target_type, a.target_id, a.details, a.created_at,
              u.username AS actor_username
         FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
        ORDER BY a.created_at DESC LIMIT 20`,
    );

    res.json({
      users: Number(totals!.users),
      blockedUsers: Number(totals!.blocked_users),
      active7d: Number(totals!.active_7d),
      active24h: Number(totals!.active_24h),
      totalBalance: Number(totals!.total_balance),
      predictions: Number(totals!.predictions),
      won: Number(totals!.won),
      lost: Number(totals!.lost),
      pending: Number(totals!.pending),
      events: Number(totals!.events),
      eventsUpcoming: Number(totals!.events_upcoming),
      prizesPending: Number(totals!.prizes_pending),
      prizesIssued: Number(totals!.prizes_issued),
      prizeFund: { used: usage.used, issued: usage.issued, limit: s['prizes.maxStars'] },
      recentAudit: recent.map((r) => ({
        id: Number(r.id),
        action: r.action,
        targetType: r.target_type,
        targetId: r.target_id,
        details: r.details,
        actorUsername: r.actor_username,
        createdAt: r.created_at,
      })),
    });
  }),
);

export default router;

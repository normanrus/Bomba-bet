import { PoolClient } from 'pg';
import { grantBonus } from './economy';
import { getSettings } from './settings';

/**
 * Transparent daily random bonus. The chance and range are published to users
 * via /api/config, so the rules are open. At most one bonus per calendar day.
 */
export async function tryDailyBonus(client: PoolClient, userId: string) {
  const settings = await getSettings();
  if (!settings['bonuses.enabled']) return { granted: false, reason: 'disabled' as const };

  const recent = await client.query(
    `SELECT 1 FROM bonus_grants
      WHERE user_id = $1 AND kind IN ('daily', 'daily_attempt')
        AND created_at > now() - interval '24 hours'
      LIMIT 1`,
    [userId],
  );
  if (recent.rowCount) return { granted: false, reason: 'already_claimed' as const };

  const roll = Math.random();
  const chance = settings['bonuses.dailyChance'];
  const details = { roll: Number(roll.toFixed(4)), chance, min: settings['bonuses.dailyMin'], max: settings['bonuses.dailyMax'] };

  if (roll >= chance) {
    await client.query(
      `INSERT INTO bonus_grants (user_id, amount, kind, details) VALUES ($1, 0, 'daily_attempt', $2::jsonb)`,
      [userId, JSON.stringify(details)],
    );
    return { granted: false, reason: 'no_luck' as const, chance };
  }

  const min = settings['bonuses.dailyMin'];
  const max = settings['bonuses.dailyMax'];
  const amount = Math.floor(min + Math.random() * (max - min + 1));
  const balance = await grantBonus(client, {
    userId,
    amount,
    kind: 'daily',
    details,
    reason: 'daily_bonus',
  });
  return { granted: true, amount, balance };
}

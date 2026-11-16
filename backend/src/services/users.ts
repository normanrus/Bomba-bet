import { one } from '../db';

export interface PublicUser {
  id: string;
  username: string;
  avatarSeed: string;
  avatarUrl: string | null;
  balance: number;
  role: string;
  status: string;
  telegramUsername: string | null;
  createdAt: string;
  stats?: UserStats;
}

export interface UserStats {
  total: number;
  won: number;
  lost: number;
  pending: number;
  winRate: number;
  staked: number;
  returned: number;
  net: number;
}

export function mapUser(row: Record<string, unknown>): PublicUser {
  return {
    id: String(row.id),
    username: String(row.username),
    avatarSeed: String(row.avatar_seed ?? 'bb'),
    avatarUrl: (row.avatar_url as string) ?? null,
    balance: Number(row.balance ?? 0),
    role: String(row.role),
    status: String(row.status),
    telegramUsername: (row.telegram_username as string) ?? null,
    createdAt: new Date(row.created_at as string).toISOString(),
  };
}

export async function getUserStats(userId: string): Promise<UserStats> {
  const row = await one<{
    total: string;
    won: string;
    lost: string;
    pending: string;
    staked: string;
    returned: string;
  }>(
    `SELECT
       count(*) FILTER (WHERE status <> 'pending')                       AS total,
       count(*) FILTER (WHERE status = 'won')                            AS won,
       count(*) FILTER (WHERE status = 'lost')                           AS lost,
       count(*) FILTER (WHERE status = 'pending')                        AS pending,
       COALESCE(sum(stake) FILTER (WHERE status <> 'pending'), 0)        AS staked,
       COALESCE(sum(payout) FILTER (WHERE status = 'won'), 0)            AS returned
     FROM predictions WHERE user_id = $1`,
    [userId],
  );
  const total = Number(row?.total ?? 0);
  const won = Number(row?.won ?? 0);
  const lost = Number(row?.lost ?? 0);
  const staked = Number(row?.staked ?? 0);
  const returned = Number(row?.returned ?? 0);
  return {
    total,
    won,
    lost,
    pending: Number(row?.pending ?? 0),
    winRate: total > 0 ? Math.round((won / total) * 1000) / 10 : 0,
    staked,
    returned,
    net: returned - staked,
  };
}

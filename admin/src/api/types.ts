export interface AdminUser {
  id: string;
  username: string;
  avatarSeed: string;
  avatarUrl: string | null;
  balance: number;
  role: string;
  status: 'active' | 'blocked';
  telegramUsername: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  wins: number;
  losses: number;
  pendingPredictions: number;
}

export interface Stats {
  users: number;
  blockedUsers: number;
  active7d: number;
  active24h: number;
  totalBalance: number;
  predictions: number;
  won: number;
  lost: number;
  pending: number;
  events: number;
  eventsUpcoming: number;
  prizesPending: number;
  prizesIssued: number;
  prizeFund: { used: number; issued: number; limit: number };
  recentAudit: AuditEntry[];
}

export interface AuditEntry {
  id: number;
  action: string;
  actorUsername: string | null;
  actorRole: string | null;
  targetType: string | null;
  targetId: string | null;
  details: unknown;
  ip: string | null;
  createdAt: string;
}

export interface Outcome {
  id: string;
  code: string | null;
  label: string;
  odds: number;
  isWinner: boolean | null;
  isActive: boolean;
  sortOrder: number;
}

export interface Market {
  id: string;
  title: string;
  kind: string;
  line: number | null;
  isActive: boolean;
  sortOrder: number;
  outcomes: Outcome[];
}

export interface Event {
  id: string;
  sport: string;
  league: string | null;
  teamHome: string;
  teamAway: string;
  startsAt: string;
  status: 'upcoming' | 'live' | 'finished' | 'cancelled';
  homeScore: number | null;
  awayScore: number | null;
  settledAt: string | null;
  markets: Market[];
  predictionCount?: number;
}

export interface Prize {
  id: string;
  userId: string;
  username?: string;
  amount: number;
  telegramUsername: string;
  status: 'pending' | 'approved' | 'issued' | 'rejected' | 'cancelled';
  userNote: string | null;
  adminNote: string | null;
  rejectReason: string | null;
  requestedAt: string;
  processedAt: string | null;
  userBalance?: number;
  userTelegram?: string | null;
  userWins?: number;
  userTotalWon?: number;
}

export interface Prediction {
  id: string;
  stake: number;
  odds: number;
  potentialPayout: number;
  payout: number;
  status: string;
  placedAt: string;
  settledAt: string | null;
  outcomeLabel: string;
  marketTitle: string;
  event: {
    id: string;
    teamHome: string;
    teamAway: string;
    league: string | null;
    startsAt: string;
    status: string;
    homeScore: number | null;
    awayScore: number | null;
  };
}

export interface LedgerEntry {
  id: number;
  delta: number;
  balanceAfter: number;
  reason: string;
  note: string | null;
  createdAt: string;
}

export interface UserDetail {
  user: AdminUser & {
    stats: {
      total: number;
      won: number;
      lost: number;
      pending: number;
      winRate: number;
      staked: number;
      returned: number;
      net: number;
    };
  };
  predictions: Prediction[];
  ledger: LedgerEntry[];
  prizes: Prize[];
}

export interface Settings {
  'app.name': string;
  'app.logoUrl': string;
  'app.tagline': string;
  'predictions.enabled': boolean;
  'predictions.minStake': number;
  'predictions.maxStake': number;
  'predictions.maxOpenPerUser': number;
  'bonuses.enabled': boolean;
  'bonuses.signupAmount': number;
  'bonuses.dailyChance': number;
  'bonuses.dailyMin': number;
  'bonuses.dailyMax': number;
  'bonuses.rulesText': string;
  'prizes.enabled': boolean;
  'prizes.maxFund': number;
  'prizes.minRequest': number;
  'prizes.rulesText': string;
  'maintenance.enabled': boolean;
  'maintenance.message': string;
}

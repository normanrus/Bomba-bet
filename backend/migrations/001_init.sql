-- BOMBA BET :: initial schema
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id          VARCHAR(255) PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- users
CREATE TABLE IF NOT EXISTS users (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username             VARCHAR(24)  NOT NULL,
  username_lower       VARCHAR(24)  NOT NULL UNIQUE,
  password_hash        TEXT         NOT NULL,
  telegram_username    VARCHAR(64),
  avatar_seed          VARCHAR(64)  NOT NULL DEFAULT 'bb',
  avatar_url           TEXT,
  role                 VARCHAR(16)  NOT NULL DEFAULT 'user'  CHECK (role IN ('user','admin')),
  status               VARCHAR(16)  NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked')),
  balance              BIGINT       NOT NULL DEFAULT 0 CHECK (balance >= 0),
  must_change_password BOOLEAN      NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  last_seen_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_users_role        ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_created_at  ON users(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_last_seen   ON users(last_seen_at DESC);

-- ---------------------------------------------------------------- refresh tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent  TEXT,
  ip          TEXT
);
CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);

-- ---------------------------------------------------------------- events
CREATE TABLE IF NOT EXISTS events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sport        VARCHAR(32)  NOT NULL DEFAULT 'football',
  league       VARCHAR(120),
  team_home    VARCHAR(120) NOT NULL,
  team_away    VARCHAR(120) NOT NULL,
  starts_at    TIMESTAMPTZ  NOT NULL,
  status       VARCHAR(16)  NOT NULL DEFAULT 'upcoming'
               CHECK (status IN ('upcoming','live','finished','cancelled')),
  home_score   INTEGER,
  away_score   INTEGER,
  settled_at   TIMESTAMPTZ,
  settled_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_status_starts ON events(status, starts_at);
CREATE INDEX IF NOT EXISTS idx_events_starts        ON events(starts_at DESC);

-- ---------------------------------------------------------------- markets / outcomes
CREATE TABLE IF NOT EXISTS markets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title       VARCHAR(120) NOT NULL,
  kind        VARCHAR(24)  NOT NULL DEFAULT 'outcome'
              CHECK (kind IN ('outcome','total','handicap','custom')),
  line        NUMERIC(6,2),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_markets_event ON markets(event_id);

CREATE TABLE IF NOT EXISTS outcomes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id   UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  code        VARCHAR(24),
  label       VARCHAR(120) NOT NULL,
  odds        NUMERIC(8,2) NOT NULL CHECK (odds >= 1.01),
  is_winner   BOOLEAN,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_outcomes_market ON outcomes(market_id);

-- ---------------------------------------------------------------- predictions
CREATE TABLE IF NOT EXISTS predictions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id         UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  market_id        UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  outcome_id       UUID NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE,
  stake            BIGINT NOT NULL CHECK (stake >= 0),
  odds             NUMERIC(8,2) NOT NULL,
  potential_payout BIGINT NOT NULL,
  payout           BIGINT NOT NULL DEFAULT 0,
  status           VARCHAR(16) NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','won','lost','void')),
  idempotency_key  VARCHAR(64),
  placed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pred_user   ON predictions(user_id, placed_at DESC);
CREATE INDEX IF NOT EXISTS idx_pred_event  ON predictions(event_id, status);
CREATE INDEX IF NOT EXISTS idx_pred_status ON predictions(status);
-- one pick per market per user: prevents contradictory/duplicate picks
CREATE UNIQUE INDEX IF NOT EXISTS uq_pred_user_market ON predictions(user_id, market_id);
-- idempotent retries from flaky mobile networks
CREATE UNIQUE INDEX IF NOT EXISTS uq_pred_idem ON predictions(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ---------------------------------------------------------------- ledger (append-only money trail)
CREATE TABLE IF NOT EXISTS ledger (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta         BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  reason        VARCHAR(32) NOT NULL,
  ref_type      VARCHAR(24),
  ref_id        TEXT,
  note          TEXT,
  actor_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ledger_user ON ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_reason ON ledger(reason);

-- ---------------------------------------------------------------- bonus grants
CREATE TABLE IF NOT EXISTS bonus_grants (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount     BIGINT NOT NULL,
  kind       VARCHAR(32) NOT NULL,
  details    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bonus_user ON bonus_grants(user_id, created_at DESC);

-- ---------------------------------------------------------------- prize requests
CREATE TABLE IF NOT EXISTS prize_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount            BIGINT NOT NULL CHECK (amount > 0),
  telegram_username VARCHAR(64) NOT NULL,
  status            VARCHAR(16) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','issued','rejected','cancelled')),
  user_note         TEXT,
  admin_note        TEXT,
  reject_reason     TEXT,
  requested_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at      TIMESTAMPTZ,
  processed_by      UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_prize_status ON prize_requests(status, requested_at);
CREATE INDEX IF NOT EXISTS idx_prize_user   ON prize_requests(user_id, requested_at DESC);

-- ---------------------------------------------------------------- settings (key/value jsonb)
CREATE TABLE IF NOT EXISTS settings (
  key        VARCHAR(64) PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------- audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL PRIMARY KEY,
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role  VARCHAR(16),
  action      VARCHAR(64) NOT NULL,
  target_type VARCHAR(32),
  target_id   TEXT,
  details     JSONB,
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor   ON audit_log(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action  ON audit_log(action);

-- ---------------------------------------------------------------- idempotency for prize requests
CREATE TABLE IF NOT EXISTS request_nonces (
  scope      VARCHAR(32) NOT NULL,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key        VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, user_id, key)
);

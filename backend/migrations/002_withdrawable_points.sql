-- BOMBA BET :: withdrawable (cashable) points + Telegram Stars prize fund
--
-- `users.balance` stays the spendable total. `users.withdrawable_balance` is
-- the cashable part: only points won from predictions land here, so bonuses
-- can never be converted into prizes. The ledger keeps the running withdrawable
-- value so the split is auditable after the fact.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS withdrawable_balance BIGINT NOT NULL DEFAULT 0
  CHECK (withdrawable_balance >= 0);

ALTER TABLE ledger
  ADD COLUMN IF NOT EXISTS withdrawable_after BIGINT NOT NULL DEFAULT 0;

-- How much of a stake was paid with cashable points, so a void/cancel refunds
-- into the same bucket the stake came from.
ALTER TABLE predictions
  ADD COLUMN IF NOT EXISTS stake_withdrawable BIGINT NOT NULL DEFAULT 0;

-- Prize requests are now denominated in Telegram Stars; `amount` keeps the
-- points cost so refunds and the ledger stay exact.
ALTER TABLE prize_requests
  ADD COLUMN IF NOT EXISTS stars INTEGER NOT NULL DEFAULT 0;

-- Backfill: existing accounts keep as cashable only the profit they actually won
-- from predictions, and never more than the balance they still hold.
UPDATE users u
   SET withdrawable_balance = LEAST(
         u.balance,
         COALESCE((
           SELECT sum(p.payout - p.stake) FROM predictions p
            WHERE p.user_id = u.id AND p.status = 'won'
         ), 0)
       )
 WHERE u.withdrawable_balance = 0;

-- The prize fund is now expressed in Telegram Stars; the old points cap is gone.
DELETE FROM settings WHERE key = 'prizes.maxFund';
DELETE FROM settings WHERE key = 'prizes.minRequest';

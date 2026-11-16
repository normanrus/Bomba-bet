-- BOMBA BET :: launch-time cleanup
--
-- Wipes the synthetic demo/test content created while the app was being built,
-- resets the point scale to human-sized numbers and recomputes everyone's
-- cashable balance. Intended to run ONCE before the friends-only launch, e.g.:
--
--   sudo docker exec -i bombabet-db-1 psql -U bombabet -d bombabet \
--     -v ON_ERROR_STOP=1 < backend/scripts/reset-test-data.sql
--
-- It deletes every event and every non-admin account, so do NOT re-run it after
-- the friends have registered and the admin has added real matches.
--
-- Idempotent against an already-clean database.

BEGIN;

-- 1. All non-admin accounts. Dependent rows (predictions, ledger, prizes,
--    refresh tokens, bonus grants) cascade or null out automatically; events
--    they settled keep their result but lose the settled_by reference.
DELETE FROM users WHERE role <> 'admin';

-- 2. All demo/test events and their markets/outcomes/predictions.
DELETE FROM events;

-- 3. Point scale: smaller, human-sized numbers.
UPDATE settings SET value = to_jsonb(500), updated_at = now() WHERE key = 'bonuses.signupAmount';
UPDATE settings SET value = to_jsonb(150), updated_at = now() WHERE key = 'bonuses.dailyMax';
UPDATE settings SET value = to_jsonb(100), updated_at = now() WHERE key = 'prizes.pointsPerStar';
UPDATE settings SET value = to_jsonb(5),   updated_at = now() WHERE key = 'prizes.minStars';
UPDATE settings
   SET value = to_jsonb('Приветственный бонус начисляется один раз при регистрации. Случайный бонус может начисляться не чаще одного раза в сутки: шанс 25%, сумма от 25 до 150 очков. Вероятности фиксированы и одинаковы для всех. Бонусные очки нельзя вывести — приз формируют только очки, выигранные в прогнозах.'::text),
       updated_at = now()
 WHERE key = 'bonuses.rulesText';

-- 4. Recompute cashable balances: only profit actually won in predictions.
UPDATE users u
   SET withdrawable_balance = LEAST(
         u.balance,
         COALESCE((SELECT sum(p.payout - p.stake) FROM predictions p
                    WHERE p.user_id = u.id AND p.status = 'won'), 0)
       );

COMMIT;

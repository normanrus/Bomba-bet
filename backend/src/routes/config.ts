import { Router } from 'express';
import { asyncHandler } from '../middleware/error';
import { getSettings } from '../services/settings';

const router = Router();

/** GET /api/config — public runtime config + transparent bonus/prize rules. */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const s = await getSettings();
    res.json({
      appName: s['app.name'],
      logoUrl: s['app.logoUrl'],
      tagline: s['app.tagline'],
      maintenance: { enabled: s['maintenance.enabled'], message: s['maintenance.message'] },
      predictions: {
        enabled: s['predictions.enabled'],
        minStake: s['predictions.minStake'],
        maxStake: s['predictions.maxStake'],
        maxOpenPerUser: s['predictions.maxOpenPerUser'],
      },
      bonuses: {
        enabled: s['bonuses.enabled'],
        signupAmount: s['bonuses.signupAmount'],
        dailyChance: s['bonuses.dailyChance'],
        dailyMin: s['bonuses.dailyMin'],
        dailyMax: s['bonuses.dailyMax'],
        rulesText: s['bonuses.rulesText'],
      },
      prizes: {
        enabled: s['prizes.enabled'],
        minRequest: s['prizes.minRequest'],
        maxFund: s['prizes.maxFund'],
        rulesText: s['prizes.rulesText'],
      },
      disclaimer:
        'БОМБА БЕТ — бесплатная игра для друзей. Очки виртуальные, депозиты и платные ставки отсутствуют. ' +
        'Призы выдаются вручную администратором в Telegram Stars.',
    });
  }),
);

export default router;

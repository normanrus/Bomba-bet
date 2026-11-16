import { Router } from 'express';
import { z } from 'zod';
import { many, withTransaction } from '../../db';
import { asyncHandler } from '../../middleware/error';
import { validate } from '../../middleware/validate';
import { audit } from '../../services/audit';
import { DEFAULT_SETTINGS, getSettings, setSettings } from '../../services/settings';
import { badRequest } from '../../utils/errors';

const router = Router();

/** GET /api/admin/settings */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ settings: await getSettings(), defaults: DEFAULT_SETTINGS });
  }),
);

/** PUT /api/admin/settings — partial patch of known keys only. */
router.put(
  '/',
  validate(z.record(z.string().max(64), z.union([z.string().max(2000), z.number(), z.boolean()]))),
  asyncHandler(async (req, res) => {
    const patch = req.body as Record<string, unknown>;
    const unknownKeys = Object.keys(patch).filter((k) => !(k in DEFAULT_SETTINGS));
    if (unknownKeys.length) throw badRequest(`Неизвестные настройки: ${unknownKeys.join(', ')}`);

    await withTransaction(async (client) => {
      await setSettings(patch, req.user!.id, client);
      await audit(
        {
          actorId: req.user!.id,
          actorRole: 'admin',
          action: 'admin.settings.update',
          targetType: 'settings',
          details: patch,
          ip: req.ip ?? null,
        },
        client,
      );
    });
    res.json({ settings: await getSettings() });
  }),
);

export default router;

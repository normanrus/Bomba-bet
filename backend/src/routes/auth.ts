import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { one, withTransaction } from '../db';
import { requireAuth, signAccessToken } from '../middleware/auth';
import { asyncHandler } from '../middleware/error';
import { validate } from '../middleware/validate';
import { audit } from '../services/audit';
import { applyBalanceChange } from '../services/economy';
import { ensureDefaultSettings, getSetting } from '../services/settings';
import { getUserStats, mapUser } from '../services/users';
import { hashPassword, randomToken, sha256, verifyPassword } from '../utils/crypto';
import { badRequest, conflict, forbidden, unauthorized } from '../utils/errors';
import { config } from '../config';

const router = Router();

const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Минимум 3 символа')
  .max(24, 'Максимум 24 символа')
  .regex(/^[A-Za-z0-9_]+$/, 'Только латиница, цифры и _');

const registerSchema = z.object({
  username: usernameSchema,
  password: z.string().min(8, 'Пароль минимум 8 символов').max(128),
  telegramUsername: z
    .string()
    .trim()
    .transform((v) => v.replace(/^@/, ''))
    .refine((v) => v === '' || /^[A-Za-z0-9_]{5,32}$/.test(v), 'Некорректный Telegram username')
    .optional(),
  avatarSeed: z.string().trim().max(64).optional(),
});

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

// Login/registration attempts are throttled per IP, since there is no user yet.
const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'rate_limited', message: 'Слишком много попыток. Попробуйте позже' } },
});

function userAgent(req: { header: (n: string) => string | undefined }) {
  return req.header('user-agent')?.slice(0, 255) ?? null;
}

async function issueTokens(user: { id: string; role: 'user' | 'admin' }, req: any) {
  const accessToken = signAccessToken(user);
  const refreshToken = randomToken(48);
  const expiresAt = new Date(Date.now() + config.refreshTtlDays * 24 * 3600 * 1000);
  await one(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [user.id, sha256(refreshToken), expiresAt, userAgent(req), req.ip ?? null],
  );
  return { accessToken, refreshToken, expiresAt: expiresAt.toISOString() };
}

router.post(
  '/register',
  authLimiter,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const { username, password, telegramUsername, avatarSeed } = req.body;

    const created = await withTransaction(async (client) => {
      const exists = await client.query('SELECT 1 FROM users WHERE username_lower = $1', [
        username.toLowerCase(),
      ]);
      if (exists.rowCount) throw conflict('Такой никнейм уже занят');

      const hash = await hashPassword(password);
      const ins = await client.query(
        `INSERT INTO users (username, username_lower, password_hash, telegram_username, avatar_seed, balance)
         VALUES ($1, $2, $3, $4, $5, 0)
         RETURNING id, username, avatar_seed, avatar_url, balance, withdrawable_balance, role, status, telegram_username, created_at`,
        [
          username,
          username.toLowerCase(),
          hash,
          telegramUsername || null,
          avatarSeed || username.slice(0, 2).toLowerCase(),
        ],
      );
      const user = ins.rows[0];

      const bonus = await getSetting('bonuses.signupAmount');
      if (bonus > 0) {
        await applyBalanceChange(client, {
          userId: user.id,
          delta: bonus,
          reason: 'signup_bonus',
          refType: 'user',
          refId: user.id,
          note: 'Приветственный бонус',
        });
        user.balance = bonus;
      }

      await audit(
        {
          actorId: user.id,
          actorRole: 'user',
          action: 'user.register',
          targetType: 'user',
          targetId: user.id,
          details: { username },
          ip: req.ip ?? null,
        },
        client,
      );
      return user;
    });

    const tokens = await issueTokens({ id: created.id, role: created.role }, req);
    const stats = await getUserStats(created.id);
    res.status(201).json({ user: { ...mapUser(created), stats }, ...tokens });
  }),
);

router.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    const row = await one<{
      id: string;
      username: string;
      password_hash: string;
      role: 'user' | 'admin';
      status: string;
      must_change_password: boolean;
      avatar_seed: string;
      avatar_url: string | null;
      balance: string;
      withdrawable_balance: string;
      telegram_username: string | null;
      created_at: string;
    }>(
      `SELECT id, username, password_hash, role, status, must_change_password,
              avatar_seed, avatar_url, balance, withdrawable_balance, telegram_username, created_at
         FROM users WHERE username_lower = $1`,
      [username.toLowerCase()],
    );

    // Uniform failure message + constant-ish work to avoid user enumeration.
    const genericFail = () => unauthorized('Неверный никнейм или пароль');
    if (!row) {
      await verifyPassword(password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali');
      throw genericFail();
    }
    const ok = await verifyPassword(password, row.password_hash);
    if (!ok) throw genericFail();
    if (row.status === 'blocked') throw forbidden('Аккаунт заблокирован администратором');

    await one('UPDATE users SET last_seen_at = now() WHERE id = $1 RETURNING id', [row.id]);
    await audit({
      actorId: row.id,
      actorRole: row.role,
      action: 'user.login',
      targetType: 'user',
      targetId: row.id,
      ip: req.ip ?? null,
    });

    const tokens = await issueTokens({ id: row.id, role: row.role }, req);
    const stats = await getUserStats(row.id);
    res.json({
      user: { ...mapUser(row), stats },
      mustChangePassword: row.must_change_password,
      ...tokens,
    });
  }),
);

router.post(
  '/refresh',
  authLimiter,
  validate(z.object({ refreshToken: z.string().min(10) })),
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    const row = await one<{ id: string; user_id: string; expires_at: string; revoked_at: string | null }>(
      'SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = $1',
      [sha256(refreshToken)],
    );
    if (!row || row.revoked_at || new Date(row.expires_at).getTime() < Date.now()) {
      throw unauthorized('Сессия истекла, войдите снова');
    }
    const user = await one<{ id: string; role: 'user' | 'admin'; status: string }>(
      'SELECT id, role, status FROM users WHERE id = $1',
      [row.user_id],
    );
    if (!user || user.status === 'blocked') throw unauthorized('Сессия недействительна');

    // Rotate: revoke the old token, issue a new pair.
    await one('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1 RETURNING id', [row.id]);
    const tokens = await issueTokens({ id: user.id, role: user.role }, req);
    res.json(tokens);
  }),
);

router.post(
  '/logout',
  validate(z.object({ refreshToken: z.string().min(10).optional() })),
  asyncHandler(async (req, res) => {
    if (req.body.refreshToken) {
      await one('UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 RETURNING id', [
        sha256(req.body.refreshToken),
      ]);
    }
    res.json({ ok: true });
  }),
);

router.post(
  '/change-password',
  requireAuth,
  validate(
    z.object({
      currentPassword: z.string().min(1).optional(),
      newPassword: z.string().min(8, 'Пароль минимум 8 символов').max(128),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const row = await one<{ password_hash: string; must_change_password: boolean }>(
      'SELECT password_hash, must_change_password FROM users WHERE id = $1',
      [req.user!.id],
    );
    if (!row) throw unauthorized();

    // A freshly seeded admin must change the password without knowing the old one.
    if (!row.must_change_password) {
      if (!currentPassword) throw badRequest('Укажите текущий пароль');
      const ok = await verifyPassword(currentPassword, row.password_hash);
      if (!ok) throw badRequest('Текущий пароль неверен');
    }

    const hash = await hashPassword(newPassword);
    await one(
      'UPDATE users SET password_hash = $2, must_change_password = false, updated_at = now() WHERE id = $1 RETURNING id',
      [req.user!.id, hash],
    );
    // Rotate the caller's session: revoke every refresh token, then hand back a fresh pair.
    await one('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL RETURNING id', [
      req.user!.id,
    ]);
    const tokens = await issueTokens({ id: req.user!.id, role: req.user!.role }, req);
    await audit({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: 'user.change_password',
      targetType: 'user',
      targetId: req.user!.id,
      ip: req.ip ?? null,
    });
    res.json({ ok: true, ...tokens });
  }),
);

export default router;

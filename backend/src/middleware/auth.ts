import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { one } from '../db';
import { forbidden, unauthorized } from '../utils/errors';

export interface AuthUser {
  id: string;
  username: string;
  role: 'user' | 'admin';
  status: 'active' | 'blocked';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export interface AccessPayload {
  sub: string;
  role: 'user' | 'admin';
  typ: 'access';
}

export function signAccessToken(user: { id: string; role: 'user' | 'admin' }): string {
  const payload: AccessPayload = { sub: user.id, role: user.role, typ: 'access' };
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.accessTtlSec });
}

/** Verifies the token and re-checks the user against the DB (status may change). */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw unauthorized();

    let payload: AccessPayload;
    try {
      payload = jwt.verify(token, config.jwtSecret) as AccessPayload;
    } catch {
      throw unauthorized('Сессия истекла, войдите снова');
    }
    if (payload.typ !== 'access') throw unauthorized();

    const user = await one<AuthUser & { must_change_password: boolean }>(
      `SELECT id, username, role, status FROM users WHERE id = $1`,
      [payload.sub],
    );
    if (!user) throw unauthorized('Пользователь не найден');
    if (user.status === 'blocked') throw forbidden('Аккаунт заблокирован администратором');

    req.user = { id: user.id, username: user.username, role: user.role, status: user.status };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== 'admin') return next(forbidden('Только для администратора'));
  next();
}

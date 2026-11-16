export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (msg: string, details?: unknown) =>
  new AppError(400, 'bad_request', msg, details);
export const unauthorized = (msg = 'Требуется авторизация') =>
  new AppError(401, 'unauthorized', msg);
export const forbidden = (msg = 'Недостаточно прав') => new AppError(403, 'forbidden', msg);
export const notFound = (msg = 'Не найдено') => new AppError(404, 'not_found', msg);
export const conflict = (msg: string, details?: unknown) =>
  new AppError(409, 'conflict', msg, details);

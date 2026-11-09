import { randomBytes, createHash } from 'node:crypto';
import { AppError } from '../utils/errors.js';

const digest = value => createHash('sha256').update(value).digest('hex');
export function createAuth(usuarios, secure = process.env.NODE_ENV === 'production') {
  const sessions = new Map();
  const maxAge = 12 * 60 * 60 * 1000;
  function token(req) { return req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith('patai_session='))?.slice(14); }
  function prune() { for (const [key, value] of sessions) if (value.expires < Date.now()) sessions.delete(key); }
  return {
    create(req, res, user) {
      prune();
      const previous = token(req);
      if (previous) sessions.delete(digest(previous));
      const value = randomBytes(32).toString('hex');
      sessions.set(digest(value), { userId: user.id, expires: Date.now() + maxAge });
      res.cookie('patai_session', value, { httpOnly: true, secure, sameSite: 'strict', maxAge, path: '/' });
    },
    destroy(req, res) { const value = token(req); if (value) sessions.delete(digest(value)); res.clearCookie('patai_session', { httpOnly: true, secure, sameSite: 'strict', path: '/' }); },
    invalidateUser(userId) { for (const [key, session] of sessions) if (session.userId === userId) sessions.delete(key); },
    async required(req, res, next) {
      const value = token(req);
      const session = value && sessions.get(digest(value));
      if (!session || session.expires < Date.now()) { if (value) sessions.delete(digest(value)); throw new AppError('Entre na sua conta para continuar.', 401); }
      req.user = await usuarios.find(session.userId);
      if (!req.user) throw new AppError('Conta não encontrada.', 401);
      next();
    },
  };
}

export function adminOnly(req, res, next) {
  if (req.user.tipo !== 'admin') throw new AppError('Acesso exclusivo da administração.', 403);
  next();
}

export function sameOrigin(req, res, next) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    if (req.headers['sec-fetch-site'] === 'cross-site') throw new AppError('Origem da solicitação não permitida.', 403);
    if (req.headers.origin && req.headers.origin !== `${req.protocol}://${req.get('host')}`) throw new AppError('Origem da solicitação não permitida.', 403);
  }
  next();
}

export function jsonBody(req, res, next) {
  if (!req.is('application/json')) throw new AppError('Envie os dados no formato JSON.', 415);
  next();
}

export function authLimiter() {
  const attempts = new Map();
  return (req, res, next) => {
    const now = Date.now();
    for (const [key, value] of attempts) if (value.until < now) attempts.delete(key);
    const key = req.ip;
    const entry = attempts.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
    entry.count++;
    attempts.set(key, entry);
    if (entry.count > 40) throw new AppError('Muitas tentativas. Aguarde 15 minutos para tentar novamente.', 429);
    next();
  };
}

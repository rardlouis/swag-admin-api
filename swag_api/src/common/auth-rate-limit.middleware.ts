import type { NextFunction, Request, Response } from 'express';

type RateLimitBucket = { count: number; resetAt: number };

const buckets = new Map<string, RateLimitBucket>();
const windowMs = 60_000;
const maxRequests = 10;

const protectedPaths = new Set([
  '/api/auth/login',
  '/api/auth/app/login',
  '/api/auth/email-otp/send',
  '/api/auth/email-otp/verify',
  '/api/auth/sms-otp/send',
  '/api/auth/sms-otp/verify',
  '/api/auth/app/password-reset/send',
  '/api/auth/app/password-reset/verify',
  '/api/auth/app/password-reset/complete',
  '/api/auth/admin/password-reset/send',
  '/api/auth/admin/password-reset/verify',
  '/api/auth/admin/password-reset/complete',
]);

export function authRateLimit(request: Request, response: Response, next: NextFunction) {
  if (request.method !== 'POST' || !protectedPaths.has(request.path)) return next();

  const now = Date.now();
  const key = `${request.ip}:${request.path}`;
  const current = buckets.get(key);
  const bucket = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + windowMs }
    : current;

  bucket.count += 1;
  buckets.set(key, bucket);

  if (bucket.count > maxRequests) {
    response.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000));
    return response.status(429).json({
      statusCode: 429,
      message: 'Too many requests. Please try again later.',
    });
  }

  return next();
}

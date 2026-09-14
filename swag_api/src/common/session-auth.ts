import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

export type SessionIdentity = { sub: string; admin: boolean; exp: number };

type RequestWithIdentity = { headers: Record<string, string | string[] | undefined>; user?: SessionIdentity };

const encode = (value: string) => Buffer.from(value).toString('base64url');
const decode = (value: string) => Buffer.from(value, 'base64url').toString('utf8');

function secret() {
  const value = process.env.JWT_SECRET?.trim();
  if (!value) throw new UnauthorizedException('Authentication is not configured.');
  return value;
}

function signature(input: string) {
  return createHmac('sha256', secret()).update(input).digest('base64url');
}

export function createSessionToken(subject: string, admin: boolean) {
  const header = encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = encode(JSON.stringify({ sub: subject, admin, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12 }));
  const input = `${header}.${payload}`;
  return `${input}.${signature(input)}`;
}

function verifySessionToken(token: string): SessionIdentity {
  const [header, payload, suppliedSignature, ...extra] = token.split('.');
  if (!header || !payload || !suppliedSignature || extra.length) throw new UnauthorizedException('Invalid authentication token.');
  const expectedSignature = signature(`${header}.${payload}`);
  const expected = Buffer.from(expectedSignature);
  const supplied = Buffer.from(suppliedSignature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new UnauthorizedException('Invalid authentication token.');
  try {
    const parsed = JSON.parse(decode(payload)) as SessionIdentity;
    if (!parsed.sub || typeof parsed.admin !== 'boolean' || !Number.isFinite(parsed.exp) || parsed.exp <= Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Your session has expired. Please sign in again.');
    }
    return parsed;
  } catch (error) {
    if (error instanceof UnauthorizedException) throw error;
    throw new UnauthorizedException('Invalid authentication token.');
  }
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<RequestWithIdentity>();
    const header = request.headers.authorization;
    const value = Array.isArray(header) ? header[0] : header;
    if (!value?.startsWith('Bearer ')) throw new UnauthorizedException('Authentication is required.');
    request.user = verifySessionToken(value.slice(7).trim());
    return true;
  }
}

@Injectable()
export class AdminGuard extends SessionAuthGuard {
  canActivate(context: ExecutionContext) {
    if (!super.canActivate(context)) return false;
    const request = context.switchToHttp().getRequest<RequestWithIdentity>();
    if (!request.user?.admin) throw new ForbiddenException('Administrator access is required.');
    return true;
  }
}

export function requireOwnership(identity: SessionIdentity | undefined, userId: string | undefined) {
  if (!identity || (!identity.admin && identity.sub !== userId)) throw new ForbiddenException('You are not authorized to access this resource.');
}

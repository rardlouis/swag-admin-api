import { authRateLimit } from './auth-rate-limit.middleware';

describe('authRateLimit', () => {
  it('rejects the eleventh login request in one minute from one IP address', () => {
    const next = jest.fn();
    const response = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const request = { method: 'POST', path: '/api/auth/login', ip: '203.0.113.10' };

    for (let index = 0; index < 10; index += 1) {
      authRateLimit(request as never, response as never, next);
    }
    authRateLimit(request as never, response as never, next);

    expect(next).toHaveBeenCalledTimes(10);
    expect(response.status).toHaveBeenCalledWith(429);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 429 }));
  });
});

import { Logger } from '@nestjs/common';
import { SafeExceptionFilter } from './safe-exception.filter';

describe('SafeExceptionFilter', () => {
  it('logs database diagnostics with secrets redacted while returning the generic 500 response', () => {
    const filter = new SafeExceptionFilter();
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const error = Object.assign(new Error('Login failed; Password=do-not-log'), {
      name: 'ConnectionError',
      code: 'ELOGIN',
      number: 18456,
      state: '28000',
      server: 'LOCALHOST',
      precedingErrors: [{ message: 'Password=still-secret', number: 18456 }],
    });
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status, json }),
        getRequest: () => ({ method: 'GET', originalUrl: '/api/products/meta/lookups' }),
      }),
    } as any;

    filter.catch(error, host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'An unexpected error occurred. Please try again later.',
    });
    const logged = String(logger.mock.calls[0][0]);
    expect(logged).toContain('ConnectionError');
    expect(logged).toContain('ELOGIN');
    expect(logged).toContain('18456');
    expect(logged).toContain('Password=[REDACTED]');
    expect(logged).not.toContain('do-not-log');
    expect(logged).not.toContain('still-secret');
    logger.mockRestore();
  });
});

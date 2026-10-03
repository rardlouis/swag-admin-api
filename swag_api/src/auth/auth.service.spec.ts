import { AuthService } from './auth.service';
import { createHash } from 'crypto';
import { hashPassword } from '../common/passwords';

describe('AuthService addressAutocomplete', () => {
  const originalApiKey = process.env.GEOAPIFY_API_KEY;
  const originalFetch = global.fetch;

  afterEach(() => {
    process.env.GEOAPIFY_API_KEY = originalApiKey;
    global.fetch = originalFetch;
  });

  it('returns normalized suggestions for a Barnabas query', async () => {
    process.env.GEOAPIFY_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{
          formatted: 'Barnabas Street, Parañaque, Philippines',
          street: 'Barnabas Street',
          suburb: 'Don Bosco',
          city: 'Parañaque',
          state: 'Metro Manila',
          postcode: '1700',
          lat: 14.48,
          lon: 121.02,
        }],
      }),
    }) as typeof fetch;

    const service = new AuthService({} as never);
    await expect(service.addressAutocomplete('barnabas')).resolves.toEqual({
      suggestions: [expect.objectContaining({
        label: 'Barnabas Street, Parañaque, Philippines',
        street: 'Barnabas Street',
        barangay: 'Don Bosco',
        city: 'Parañaque',
        province: '',
        region: 'National Capital Region (NCR)',
        zip: '1700',
      })],
    });
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('text=barnabas'));
  });

  it('reverse geocodes a device location without exposing the Geoapify key', async () => {
    process.env.GEOAPIFY_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ formatted: '1152 Tabora Street, Manila, Philippines', housenumber: '1152', street: 'Tabora Street', suburb: 'Barangay 197', city: 'Manila', state: 'Metro Manila', state_district: 'NCR', postcode: '1012' }],
      }),
    }) as typeof fetch;

    const service = new AuthService({} as never);
    await expect(service.reverseGeocodeAddress('14.5995', '120.9842')).resolves.toEqual({
      address: expect.objectContaining({ houseNo: '1152', street: 'Tabora Street', city: 'Manila', province: '', region: 'National Capital Region (NCR)', zip: '1012' }),
    });
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/v1/geocode/reverse?lat=14.5995&lon=120.9842'));
  });
});

describe('AuthService password reset sessions', () => {
  it('mints a reset session after OTP verification and consumes that session during reset', async () => {
    const email = 'customer@example.com';
    const code = '123456';
    const otpRowId = '11111111-1111-4111-8111-111111111111';
    const userId = '22222222-2222-4222-8222-222222222222';
    const oldPasswordHash = await hashPassword('OldPassword1');
    const queries: Array<{ text: string; values: Map<string, unknown> }> = [];

    const database = {
      query: jest.fn().mockResolvedValue([]),
      columnExists: jest.fn().mockResolvedValue(true),
      request: jest.fn(async (handler: (request: unknown) => Promise<{ recordset: unknown[] }>) => {
        const values = new Map<string, unknown>();
        const request = {
          input: jest.fn((name: string, _type: unknown, value: unknown) => {
            values.set(name, value);
            return request;
          }),
          query: jest.fn(async (text: string) => {
            queries.push({ text, values: new Map(values) });
            if (text.includes('DATEDIFF(SECOND, GETDATE(), expires_at)')) {
              return {
                recordset: [{
                  id: otpRowId,
                  codeHash: createHash('sha256').update(`${email}:password_reset:${code}`).digest('hex'),
                  secondsRemaining: 300,
                  attempts: 0,
                }],
              };
            }
            if (text.includes('SELECT COUNT(*) AS count FROM EMAIL_OTPS')) {
              return { recordset: [{ count: 1 }] };
            }
            if (text.includes('FROM USERS WHERE LOWER(email) = LOWER(@email)')) {
              return { recordset: [{ userId, passwordHash: oldPasswordHash }] };
            }
            return { recordset: [] };
          }),
        };
        const result = await handler(request);
        return result.recordset;
      }),
    };
    const service = new AuthService(database as never, {} as never);

    const verification = await service.verifyPasswordResetOtp(email, code);

    expect(verification.verificationId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(verification.verificationId).not.toBe(otpRowId);
    expect(verification.resetSessionId).toBe(verification.verificationId);

    await expect(service.completePasswordReset({
      email,
      verificationId: verification.verificationId,
      password: 'NewPassword1',
      confirmPassword: 'NewPassword1',
    })).resolves.toMatchObject({ passwordReset: true });

    const resetSessionCheck = queries.find(({ text }) => text.includes('reset_session_expires_at > GETDATE()'));
    expect(resetSessionCheck?.text).toContain('reset_session_id = @resetSessionId');
    expect(resetSessionCheck?.text).not.toMatch(/\bexpires_at\s*>\s*GETDATE\(\)/);
    expect(resetSessionCheck?.values.get('resetSessionId')).toBe(verification.verificationId);
    expect(queries.some(({ text }) => text.includes('reset_session_id = NULL'))).toBe(true);
  });
});

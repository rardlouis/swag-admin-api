import { PlayReviewerAccountService } from './play-reviewer-account.service';

describe('PlayReviewerAccountService', () => {
  const original = {
    enabled: process.env.PLAY_REVIEWER_ENABLED,
    email: process.env.PLAY_REVIEWER_EMAIL,
    password: process.env.PLAY_REVIEWER_PASSWORD,
  };

  afterEach(() => {
    process.env.PLAY_REVIEWER_ENABLED = original.enabled;
    process.env.PLAY_REVIEWER_EMAIL = original.email;
    process.env.PLAY_REVIEWER_PASSWORD = original.password;
  });

  it('does nothing while disabled', async () => {
    process.env.PLAY_REVIEWER_ENABLED = 'false';
    const database = { request: jest.fn() };

    await new PlayReviewerAccountService(database as never).onModuleInit();

    expect(database.request).not.toHaveBeenCalled();
  });

  it('creates only a non-admin customer for the configured email', async () => {
    process.env.PLAY_REVIEWER_ENABLED = 'true';
    process.env.PLAY_REVIEWER_EMAIL = 'reviewer@example.com';
    process.env.PLAY_REVIEWER_PASSWORD = 'ReviewerPassword1';
    const calls: Array<{ text: string; values: Map<string, unknown> }> = [];
    const database = {
      request: jest.fn(async (handler: (request: unknown) => Promise<{ recordset: unknown[] }>) => {
        const values = new Map<string, unknown>();
        const request = {
          input: jest.fn((name: string, _type: unknown, value: unknown) => {
            values.set(name, value);
            return request;
          }),
          query: jest.fn(async (text: string) => {
            calls.push({ text, values: new Map(values) });
            return { recordset: [] };
          }),
        };
        return (await handler(request)).recordset;
      }),
    };

    await new PlayReviewerAccountService(database as never).onModuleInit();

    const insert = calls.find(({ text }) => text.includes('INSERT INTO USERS'));
    expect(insert?.text).toContain('0, 0, 1');
    expect(insert?.values.get('email')).toBe('reviewer@example.com');
    expect(insert?.values.get('passwordHash')).not.toBe(process.env.PLAY_REVIEWER_PASSWORD);
  });

  it('refuses to use an existing administrator email', async () => {
    process.env.PLAY_REVIEWER_ENABLED = 'true';
    process.env.PLAY_REVIEWER_EMAIL = 'admin@example.com';
    process.env.PLAY_REVIEWER_PASSWORD = 'ReviewerPassword1';
    const database = {
      request: jest.fn(async (handler: (request: unknown) => Promise<{ recordset: unknown[] }>) => {
        const request = {
          input: jest.fn(() => request),
          query: jest.fn(async () => ({ recordset: [{ isAdmin: true }] })),
        };
        return (await handler(request)).recordset;
      }),
    };

    await expect(new PlayReviewerAccountService(database as never).onModuleInit())
      .rejects.toThrow('administrator account');
  });
});

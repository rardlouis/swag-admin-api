import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DatabaseService } from '../database/database.service';
import { AuthModule } from './auth.module';

describe('AuthController', () => {
  let app: INestApplication;
  const originalApiKey = process.env.GEOAPIFY_API_KEY;
  const originalFetch = global.fetch;

  beforeEach(async () => {
    process.env.GEOAPIFY_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ formatted: 'Barnabas Street, Parañaque, Philippines', street: 'Barnabas Street' }] }),
    }) as typeof fetch;

    const module = await Test.createTestingModule({ imports: [AuthModule] })
      .overrideProvider(DatabaseService)
      .useValue({})
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    process.env.GEOAPIFY_API_KEY = originalApiKey;
    global.fetch = originalFetch;
  });

  it('serves GET /api/auth/address-autocomplete?text=barnabas', async () => {
    await request(app.getHttpServer())
      .get('/api/auth/address-autocomplete?text=barnabas')
      .expect(200)
      .expect(({ body }) => {
        expect(body.suggestions).toEqual([expect.objectContaining({ street: 'Barnabas Street' })]);
      });
  });

  it('serves GET /api/auth/address-reverse-geocode', async () => {
    await request(app.getHttpServer())
      .get('/api/auth/address-reverse-geocode?lat=14.5995&lon=120.9842')
      .expect(200)
      .expect(({ body }) => {
        expect(body.address).toEqual(expect.objectContaining({ street: 'Barnabas Street' }));
      });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return the API health message', () => {
      expect(appController.getHello()).toBe('SWAG API is running');
    });
  });

  describe('health', () => {
    it('returns an operational status without database details', () => {
      expect(appController.health()).toEqual({ status: 'ok' });
    });
  });
});

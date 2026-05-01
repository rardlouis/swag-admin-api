import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { mkdirSync } from 'fs';

async function bootstrap() {
  mkdirSync(join(process.cwd(), 'uploads', 'products'), { recursive: true });
  mkdirSync(join(process.cwd(), 'uploads', 'profiles'), { recursive: true });
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  });
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });
  app.setGlobalPrefix('api');

  await app.listen(process.env.PORT ?? 5000);
}
bootstrap();

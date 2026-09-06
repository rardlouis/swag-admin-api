import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { existsSync, mkdirSync, readFileSync } from 'fs';

function loadEnvFile() {
  const candidates = [
    join(process.cwd(), '.env'),
    join(process.cwd(), '..', '.env'),
  ];
  const envPath = candidates.find((candidate) => existsSync(candidate));

  if (!envPath) return;

  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex < 1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');
    process.env[key] ??= value;
  }
}

async function bootstrap() {
  loadEnvFile();
  mkdirSync(join(process.cwd(), 'uploads', 'products'), { recursive: true });
  mkdirSync(join(process.cwd(), 'uploads', 'profiles'), { recursive: true });
  mkdirSync(join(process.cwd(), 'uploads', 'receipts'), { recursive: true });
  mkdirSync(join(process.cwd(), 'uploads', 'reviews'), { recursive: true });
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors({
    origin: true,
    credentials: true,
  });
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });
  app.setGlobalPrefix('api');

  await app.listen(process.env.PORT ?? 5000);
}
bootstrap();

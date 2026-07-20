import { Module } from '@nestjs/common';
import { TryonController } from './tryon.controller';
import { TryonService } from './tryon.service';

@Module({
  controllers: [TryonController],
  providers: [TryonService],
})
export class TryonModule {}

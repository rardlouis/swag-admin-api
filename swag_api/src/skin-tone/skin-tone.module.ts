import { Module } from '@nestjs/common';
import { SkinToneController } from './skin-tone.controller';
import { SkinToneService } from './skin-tone.service';

@Module({
  controllers: [SkinToneController],
  providers: [SkinToneService],
})
export class SkinToneModule {}

import { Body, Controller, Post } from '@nestjs/common';
import { SkinToneService } from './skin-tone.service';

@Controller('skin-tone')
export class SkinToneController {
  constructor(private readonly skinToneService: SkinToneService) {}

  @Post('analyze')
  analyze(@Body('image') image: unknown) {
    return this.skinToneService.analyze(image);
  }
}

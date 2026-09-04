import { Controller, Get, Param, Post, Body, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { TryonService } from './tryon.service';

@Controller('tryon')
export class TryonController {
  constructor(private readonly tryonService: TryonService) {}

  @Post('upload')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'person_image', maxCount: 1 },
        { name: 'garment_image', maxCount: 1 },
      ],
      {
        storage: memoryStorage(),
        limits: {
          files: 2,
          fileSize: 8 * 1024 * 1024,
        },
        fileFilter: (_request, file, callback) => {
          callback(null, /^image\/(png|jpe?g|webp|heic|heif)$/i.test(file.mimetype));
        },
      },
    ),
  )
  upload(@Body() body: Record<string, string | string[] | undefined>, @UploadedFiles() files) {
    return this.tryonService.upload(body, files);
  }

  @Post('upload-three-piece')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'person_image', maxCount: 1 },
        { name: 'dress_image', maxCount: 1 },
        { name: 'bottom_image', maxCount: 1 },
        { name: 'top_image', maxCount: 1 },
      ],
      {
        storage: memoryStorage(),
        limits: {
          files: 4,
          fileSize: 8 * 1024 * 1024,
        },
        fileFilter: (_request, file, callback) => {
          callback(null, /^image\/(png|jpe?g|webp|heic|heif)$/i.test(file.mimetype));
        },
      },
    ),
  )
  uploadThreePiece(@Body() body: Record<string, string | string[] | undefined>, @UploadedFiles() files) {
    return this.tryonService.uploadThreePiece(body, files);
  }

  @Get('progress/:jobId')
  progress(@Param('jobId') jobId: string) {
    return this.tryonService.progress(jobId);
  }
}

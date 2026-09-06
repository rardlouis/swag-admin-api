import { Body, Controller, Get, Param, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { ReviewsService } from './reviews.service';

type UploadedReviewFile = {
  filename: string;
  mimetype: string;
};

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  list(@Query('userId') userId?: string) {
    return this.reviewsService.list(userId);
  }

  @Get('eligibility')
  eligibility(@Query('userId') userId?: string, @Query('productId') productId?: string) {
    return this.reviewsService.eligibility(userId, productId);
  }

  @Get(':id')
  detail(@Param('id') id: string, @Query('userId') userId?: string) {
    return this.reviewsService.detail(id, userId);
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: diskStorage({
        destination: './uploads/reviews',
        filename: (_request, file, callback) => {
          const safeName = file.originalname
            .replace(extname(file.originalname), '')
            .replace(/[^a-z0-9]+/gi, '-')
            .replace(/^-|-$/g, '')
            .toLowerCase();
          callback(null, `${Date.now()}-${safeName}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (_request, file, callback) => {
        callback(null, /^image\/(png|jpe?g|webp|heic|heif)$/i.test(file.mimetype));
      },
      limits: { fileSize: 6 * 1024 * 1024 },
    }),
  )
  create(@Body() body: Record<string, string | undefined>, @UploadedFile() file?: UploadedReviewFile) {
    return this.reviewsService.create(body, file);
  }

  @Post(':id/react')
  react(@Param('id') id: string, @Body() body: { userId?: string; type?: string }) {
    return this.reviewsService.react(id, body);
  }

  @Post(':id/replies')
  reply(@Param('id') id: string, @Body() body: { userId?: string; comment?: string }) {
    return this.reviewsService.reply(id, body);
  }
}

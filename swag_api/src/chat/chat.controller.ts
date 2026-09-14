import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { ChatService } from './chat.service';
import { SessionAuthGuard, requireOwnership, type SessionIdentity } from '../common/session-auth';

@Controller('chat')
@UseGuards(SessionAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('users/:userId/conversations')
  conversations(@Param('userId') userId: string, @Req() request: { user?: SessionIdentity }) {
    requireOwnership(request.user, userId);
    return this.chatService.conversations(userId);
  }

  @Post('conversations')
  createConversation(@Body('userId') userId: string, @Body('productId') productId: string, @Req() request: { user?: SessionIdentity }) {
    requireOwnership(request.user, userId);
    return this.chatService.createConversation(userId, productId);
  }

  @Post('conversations/ai')
  createAiConversation(@Body('userId') userId: string, @Req() request: { user?: SessionIdentity }) {
    requireOwnership(request.user, userId);
    return this.chatService.createBotConversation(userId);
  }

  @Post('ai/conversations')
  createAiConversationAlias(@Body('userId') userId: string, @Req() request: { user?: SessionIdentity }) {
    requireOwnership(request.user, userId);
    return this.chatService.createBotConversation(userId);
  }

  @Post('conversations/:id/messages')
  sendMessage(
    @Param('id') conversationId: string,
    @Body('userId') userId: string,
    @Body('text') text: string, @Req() request: { user?: SessionIdentity },
  ) {
    requireOwnership(request.user, userId);
    return this.chatService.sendMessage(conversationId, userId, text);
  }

  @Post('conversations/:id/read')
  markRead(@Param('id') conversationId: string, @Body('userId') userId: string, @Req() request: { user?: SessionIdentity }) {
    requireOwnership(request.user, userId);
    return this.chatService.markRead(conversationId, userId);
  }

  @Post('conversations/:id/images')
  @UseInterceptors(FileInterceptor('image', {
    storage: diskStorage({ destination: './uploads/messages', filename: (_request, file, callback) => callback(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${extname(file.originalname).toLowerCase()}`) }),
    fileFilter: (_request, file, callback) => callback(null, /^image\/(png|jpe?g|webp|heic|heif)$/i.test(file.mimetype)),
    limits: { fileSize: 6 * 1024 * 1024 },
  }))
  sendImage(@Param('id') conversationId: string, @Body('userId') userId: string, @UploadedFile() file: { filename: string; mimetype: string } | undefined, @Req() request: { user?: SessionIdentity }) {
    requireOwnership(request.user, userId);
    if (!file || !/^image\/(png|jpe?g|webp|heic|heif)$/i.test(file.mimetype)) throw new BadRequestException('Only image attachments are allowed.');
    return this.chatService.sendMessage(conversationId, userId, `/uploads/messages/${file.filename}`);
  }

  @Delete('conversations/:id/users/:userId')
  deleteConversation(@Param('id') conversationId: string, @Param('userId') userId: string, @Req() request: { user?: SessionIdentity }) {
    requireOwnership(request.user, userId);
    return this.chatService.deleteConversation(conversationId, userId);
  }

  @Delete('users/:userId/conversations/:id')
  deleteUserConversation(@Param('id') conversationId: string, @Param('userId') userId: string, @Req() request: { user?: SessionIdentity }) {
    requireOwnership(request.user, userId);
    return this.chatService.deleteConversation(conversationId, userId);
  }
}

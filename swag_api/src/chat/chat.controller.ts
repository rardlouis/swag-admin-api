import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('users/:userId/conversations')
  conversations(@Param('userId') userId: string) {
    return this.chatService.conversations(userId);
  }

  @Post('conversations')
  createConversation(@Body('userId') userId: string, @Body('productId') productId: string) {
    return this.chatService.createConversation(userId, productId);
  }

  @Post('conversations/:id/messages')
  sendMessage(
    @Param('id') conversationId: string,
    @Body('userId') userId: string,
    @Body('text') text: string,
  ) {
    return this.chatService.sendMessage(conversationId, userId, text);
  }

  @Post('conversations/:id/read')
  markRead(@Param('id') conversationId: string, @Body('userId') userId: string) {
    return this.chatService.markRead(conversationId, userId);
  }
}

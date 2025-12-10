import { Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiBody,
  ApiResponse,
  ApiOperation,
} from '@nestjs/swagger';
import { ChatService } from '../services/chat.service';
import { ChatRequestDto, ChatResponseDto } from '@chatbot-project-1/models';
import { ApiKeyGuard } from '@chatbot-project-1/auth';
import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

const ChatRequestSchema = z.object({
  message: z.string().min(1),
});

@ApiTags('Chat')
@ApiBearerAuth('api-key')
@UseGuards(ApiKeyGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  @ApiOperation({ summary: 'Sendet eine Nachricht an den AI-Bot' })
  @ApiBody({ type: ChatRequestDto })
  @ApiResponse({ status: 200, type: ChatResponseDto, description: 'Bot-Antwort' })
  @ApiResponse({ status: 400, description: 'Ungültige Eingabe (Zod)' })
  @ApiResponse({ status: 401, description: 'Fehlender API-Key' })
  @ApiResponse({ status: 403, description: 'Ungültiger API-Key' })
  async handleChat(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
    try {
      const parsed = ChatRequestSchema.parse(req.body);
      const result = await this.chatService.processMessage(parsed.message);
      res.send({ response: result });
    } catch (err) {
      res.status(400).send({
        error: err instanceof Error ? err.message : 'Ungültige Eingabe',
      });
    }
  }

  @Get('speechToText')
  @ApiOperation({ summary: 'Testet Speech to text' })
  async speachToText(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
    try {
      const result = await this.chatService.testSpeechToText();
      res.send({ response: result });
    } catch (err) {
      res.status(400).send({
        error: err instanceof Error ? err.message : 'Ungültige Eingabe',
      });
    }
  }

  @Post('textToSpeech')
  @ApiOperation({ summary: 'Erzeugt eine mp3 datei aus einer Textnachricht' })
  @ApiBody({ type: ChatRequestDto })
  async textToSpeech(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
    try {
      const parsed = ChatRequestSchema.parse(req.body);
      const result = await this.chatService.testTranslateText(parsed.message);
      res.send({ response: result });
    } catch (err) {
      res.status(400).send({
        error: err instanceof Error ? err.message : 'Ungültige Eingabe',
      });
    }
  }

}

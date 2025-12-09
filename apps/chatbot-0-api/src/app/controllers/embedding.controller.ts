import {
  Controller,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiBody,
  ApiResponse,
  ApiOperation,
} from '@nestjs/swagger';
import { ChatRequestDto, ChatResponseDto } from '@chatbot-project-1/models';
import { ApiKeyGuard } from '@chatbot-project-1/auth';
import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { EmbeddingService } from '../services/embedding.service';

const ChatRequestSchema = z.object({
  message: z.string().min(1),
});

@ApiTags('Embedding')
@ApiBearerAuth('api-key')
@UseGuards(ApiKeyGuard)
@Controller('embedding')
export class EmbeddingController {
  constructor(private readonly embeddingService: EmbeddingService) {}

  @Post('generate-embedding')
  @ApiOperation({ summary: 'Zerlegt eine Antwort in Vektoren' })
  @ApiBody({ type: ChatRequestDto })
  @ApiResponse({ status: 200, type: ChatResponseDto, description: 'Bot-Antwort' })
  @ApiResponse({ status: 400, description: 'Ungültige Eingabe (Zod)' })
  @ApiResponse({ status: 401, description: 'Fehlender API-Key' })
  @ApiResponse({ status: 403, description: 'Ungültiger API-Key' })
  async handleChat(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
    try {
      const parsed = ChatRequestSchema.parse(req.body);
      const result = await this.embeddingService.createEmbedding(parsed.message);
      res.send({ response: result });
      return 'Message wurde in Vektoren zerlegt';
    } catch (err) {
      res.status(400).send({
        error: err instanceof Error ? err.message : 'Ungültige Eingabe',
      });
    }
  }
}

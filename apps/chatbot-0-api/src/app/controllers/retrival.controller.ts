import { Controller, Post, Body } from '@nestjs/common';
import { RetrievalService } from '../services/retrival.service';
import { z } from 'zod';
import { ApiBody, ApiTags } from '@nestjs/swagger';

const AskSchema = z.object({
  question: z.string().min(5),
});

class AskDto {
  question: string;
}

@ApiTags('Retrieval')
@Controller('ask')
export class RetrievalController {
  constructor(private readonly retrievalService: RetrievalService) {}

  @Post()
  @ApiBody({ type: AskDto })
  async ask(@Body() body: AskDto) {
    const parsed = AskSchema.parse(body);
    const results = await this.retrievalService.getRelevantDocuments(parsed.question);
    return { context: results };
  }
}

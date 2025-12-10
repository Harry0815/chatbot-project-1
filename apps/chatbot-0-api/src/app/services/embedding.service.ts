import { Injectable } from '@nestjs/common';
import {
  OpenAiEmbeddingService,
} from '@chatbot-project-1/openai';
import { EmbeddingRepository } from '@chatbot-project-1/db';

@Injectable()
export class EmbeddingService {
  constructor(
    private readonly openAiService: OpenAiEmbeddingService,
    private readonly embeddingsRepository: EmbeddingRepository
  ) { }

  async createEmbedding(message: string): Promise<void> {
    const response = await this.openAiService.generateEmbedding(message);
    await this.embeddingsRepository.saveEmbedding(message, response);
  }
}

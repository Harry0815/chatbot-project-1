import { Injectable } from '@nestjs/common';
import { generateEmbedding } from '@chatbot-project-1/openai';
import { saveEmbedding } from '@chatbot-project-1/db';

@Injectable()
export class EmbeddingService {
  async createEmbedding(message: string): Promise<void> {
    const response = await generateEmbedding(message);
    await saveEmbedding(message, response);
  }
}

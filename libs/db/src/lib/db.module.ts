import { Module } from '@nestjs/common';
import {
  OpenAiEmbeddingService,
  OpenAiModule,
  OpenAiService,
} from '@chatbot-project-1/openai';
import { EmbeddingRepository } from './embedding.repository';

@Module({
  imports: [OpenAiModule],
  controllers: [],
  providers: [
    OpenAiEmbeddingService,
    OpenAiService,
    EmbeddingRepository
  ],
  exports: [
    EmbeddingRepository
  ],
})
export class DbModule {}

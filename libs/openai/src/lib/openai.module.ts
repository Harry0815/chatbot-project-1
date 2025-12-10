import { Module } from '@nestjs/common';
import { OpenAiEmbeddingService } from './embedding.service';
import { OpenAiService } from './openai.service';

@Module({
  controllers: [],
  providers: [
    OpenAiEmbeddingService,
    OpenAiService
  ],
  exports: [
    OpenAiEmbeddingService,
    OpenAiService
  ],
})
export class OpenAiModule {}

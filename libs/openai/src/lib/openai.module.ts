import { Module } from '@nestjs/common';
import { OpenAiEmbeddingService } from './embedding.service';
import { OpenAiService } from './openai.service';
import { RealTimeService } from './real-time.service';

@Module({
  controllers: [],
  providers: [
    OpenAiEmbeddingService,
    OpenAiService,
    RealTimeService
  ],
  exports: [
    OpenAiEmbeddingService,
    OpenAiService,
    RealTimeService,
  ],
})
export class OpenAiModule {}

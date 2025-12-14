import { Module } from '@nestjs/common';
import { OpenAiEmbeddingService } from './embedding.service';
import { OpenAiService } from './openai.service';
import { RealTimeService } from './real-time.service';
import { SocketlessRealTimeService } from './socketless-real-time.service';

@Module({
  controllers: [],
  providers: [
    OpenAiEmbeddingService,
    OpenAiService,
    RealTimeService,
    SocketlessRealTimeService
  ],
  exports: [
    OpenAiEmbeddingService,
    OpenAiService,
    RealTimeService,
    SocketlessRealTimeService
  ],
})
export class OpenAiModule {}

import { Module } from '@nestjs/common';
import { ChatController } from './controllers/chat.controller';
import { ChatService } from './services/chat.service';
import { EmbeddingController } from './controllers/embedding.controller';
import { EmbeddingService } from './services/embedding.service';
import { RetrievalController } from './controllers/retrival.controller';
import { RetrievalService } from './services/retrival.service';
import {
  OpenAiEmbeddingService,
  OpenAiModule,
  OpenAiService,
} from '@chatbot-project-1/openai';
import { DbModule } from '@chatbot-project-1/db';

@Module({
  imports: [
    OpenAiModule,
    DbModule
  ],
  controllers: [
    ChatController,
    EmbeddingController,
    RetrievalController
  ],
  providers: [
    ChatService,
    EmbeddingService,
    RetrievalService,
    OpenAiEmbeddingService,
    OpenAiService
  ],
})
export class AppModule {}

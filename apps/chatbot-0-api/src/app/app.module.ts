import { Module } from '@nestjs/common';
import { ChatController } from './controllers/chat.controller';
import { ChatService } from './services/chat.service';
import { EmbeddingController } from './controllers/embedding.controller';
import { EmbeddingService } from './services/embedding.service';
import { RetrievalController } from './controllers/retrival.controller';
import { RetrievalService } from './services/retrival.service';

@Module({
  imports: [],
  controllers: [ChatController, EmbeddingController, RetrievalController],
  providers: [ChatService, EmbeddingService, RetrievalService],
})
export class AppModule {}

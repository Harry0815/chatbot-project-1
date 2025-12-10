import { db } from './client';
import { sql } from 'drizzle-orm';
import { embeddingDocument } from './schema/embedded.schema';
import {
  OpenAiEmbeddingService,
} from '@chatbot-project-1/openai';
import { Injectable } from '@nestjs/common';

@Injectable()
export class EmbeddingRepository {
  constructor(private readonly openAiService: OpenAiEmbeddingService) {}

  async saveEmbedding(content: string, embedding: number[]) {
    await db.execute(
      sql`
      INSERT INTO ${embeddingDocument} (content, embedding)
      VALUES (${content}, ${JSON.stringify(embedding)}::vector)
    `
    );
  }

  async searchSimilarDocuments(query: string, limit = 1): Promise<string[]> {
    const embedding = await this.openAiService.generateEmbedding(query);

    const result = await db.execute(
      sql`
      SELECT content
      FROM documents
      ORDER BY embedding <-> ${JSON.stringify(embedding)}::vector
      LIMIT ${limit};
    `
    );

    // PostgreSQL gibt ein Array von Objekten zurück
    return result.rows.map((row ): string => row['content'] as string);
  }
}


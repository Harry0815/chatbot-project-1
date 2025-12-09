import { Injectable } from '@nestjs/common';
import { generateEmbedding } from '@chatbot-project-1/openai';
import { db, embeddingDocument } from '@chatbot-project-1/db';
import { sql } from 'drizzle-orm';

@Injectable()
export class RetrievalService {
  async getRelevantDocuments(query: string): Promise<string[]> {
    const embedding = await generateEmbedding(query);

    const result = await db.execute(
      sql`
        SELECT content
        FROM ${embeddingDocument}
        ORDER BY embedding <-> ${JSON.stringify(embedding)}::vector
        LIMIT 3
      `
    );

    return result.rows.map((row) => row.content as string);
  }
}

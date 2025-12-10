import { Injectable } from '@nestjs/common';
import {
  OpenAiEmbeddingService,
} from '@chatbot-project-1/openai';
import {
  db,
  embeddingDocument,
  EmbeddingRepository,
} from '@chatbot-project-1/db';
import { sql } from 'drizzle-orm';
import * as fs from 'fs/promises';

type FaqEntry = {
  question: string;
  answer: string;
};

@Injectable()
export class RetrievalService {
  constructor(
    private readonly openAiService: OpenAiEmbeddingService,
    private readonly embeddingsRepository: EmbeddingRepository
  ) {
  }

  async getRelevantDocuments(query: string): Promise<string[]> {
    const embedding = await this.openAiService.generateEmbedding(query);

    const result = await db.execute(
      sql`
        SELECT content
        FROM ${embeddingDocument}
        ORDER BY embedding <-> ${JSON.stringify(embedding)}::vector
        LIMIT 1
      `
    );

    return result.rows.map((row) => row.content as string);
  }

  async loadAndEmbedFromFile(filePath: string) {
    const data = await fs.readFile(filePath, 'utf-8');
    const entries: FaqEntry[] = JSON.parse(data);

    console.log(`📄 Lade ${entries.length} FAQs...`);

    for (const item of entries) {
      const content = `Frage: ${item.question}\nAntwort: ${item.answer}`;

      try {
        console.log(`🔄 Embed & speichere: "${item.question}"`);
        await this.embedAndStore(content);
      } catch (err) {
        console.error(`❌ Fehler bei "${item.question}":`, err);
      }
    }
    console.log('✅ Alle FAQs verarbeitet.');
  }

  async embedAndStore (content: string) {
    const vector = await this.openAiService.generateEmbedding(content);
    await this.embeddingsRepository.saveEmbedding(content, vector);
  };
}

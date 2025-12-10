import * as dotenv from 'dotenv';
import { Injectable } from '@nestjs/common';

dotenv.config();

@Injectable()
export class OpenAiEmbeddingService {
  async generateEmbedding(text: string): Promise<number[]> {
    const apiKey = process.env['OPENAI_API_KEY'];

    if (!apiKey)
      throw new Error('Missing OPENAI_API_KEY');

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-ada-002', // oder 'text-embedding-ada-002'
        encoding_format: 'float',
        input: text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI error: ${response.status} - ${error}`);
    }

    const json = await response.json();
    return json.data[0].embedding;
  }
}


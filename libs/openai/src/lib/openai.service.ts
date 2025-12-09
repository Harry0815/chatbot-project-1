import * as dotenv from 'dotenv';
import { OpenAI } from 'openai';
dotenv.config();

export async function callOpenAI(prompt: string): Promise<string> {
  const apiKey = process.env['OPENAI_API_KEY'];

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing in .env');
  }

  const client = new OpenAI();

  const response = await client.responses.create({
    model: "gpt-5-nano",
    input: prompt
  })
  return response.output_text;
}

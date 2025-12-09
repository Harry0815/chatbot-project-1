import { db } from './client';
import { chatMessages, apiKeys } from './schema/chatbot-init.schema';
import { eq } from 'drizzle-orm';

export async function saveChat(userMessage: string, botResponse: string) {
  await db.insert(chatMessages).values({ userMessage, botResponse });
}

export async function isValidApiKey(key: string): Promise<boolean> {
  const result = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.key, key));
  return result.length > 0;
}

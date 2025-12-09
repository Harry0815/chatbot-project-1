import {
  pgSchema,
  serial,
  text,
  timestamp,
  varchar
} from 'drizzle-orm/pg-core';

export const chatbotSchema = pgSchema('chatbot')
export const chatMessages = chatbotSchema.table('chat_messages', {
  id: serial('id').primaryKey(),
  userMessage: text('user_message').notNull(),
  botResponse: text('bot_response').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const apiKeys = chatbotSchema.table('api_keys', {
  id: serial('id').primaryKey(),
  key: varchar('key', { length: 255 }).notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow(),
});

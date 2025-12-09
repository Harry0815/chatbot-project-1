import {
  pgSchema,
  serial,
  text,
  vector
} from 'drizzle-orm/pg-core';

export const embeddingSchema = pgSchema('teaching')
export const embeddingDocument = embeddingSchema.table('documents', {
  id: serial('id').primaryKey(),
  content: text('content').notNull(),
  embedding: vector( 'embedding', {
    dimensions: 1536,
  }),
});

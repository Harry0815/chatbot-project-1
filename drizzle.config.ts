import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  schema: './libs/db/src/lib/schema/*.schema.ts',
  dialect: 'postgresql',
  out: './libs/db/src/lib/migrations',
  dbCredentials: {
    user: 'postgres',
    password: 'postgres',
    host: 'localhost',
    port: +'5432',
    database: 'chatbot',
    ssl: false,
  },
  verbose: true,
  strict: true,
  breakpoints: false,
});


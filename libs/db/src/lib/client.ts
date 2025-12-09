import * as dotenv from 'dotenv';
dotenv.config();

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema/chatbot-init.schema';

const pool = new Pool({
  connectionString: 'postgres://postgres:postgres@localhost:5432/chatbot'
});

export const db = drizzle(pool, { schema });

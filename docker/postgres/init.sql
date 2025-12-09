-- Wird beim ersten Start ausgeführt
CREATE EXTENSION IF NOT EXISTS vector;

create schema teaching;
CREATE TABLE teaching.documents (
   id SERIAL PRIMARY KEY,
   content TEXT,
   embedding vector(1536) -- für OpenAI-Embeddings
);

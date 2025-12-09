CREATE SCHEMA "chatbot";

CREATE TABLE "chatbot"."api_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(255) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "api_keys_key_unique" UNIQUE("key")
);

CREATE TABLE "chatbot"."chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_message" text NOT NULL,
	"bot_response" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);

import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app/app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { patchNestJsSwagger } from 'nestjs-zod';


async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter()
  );

  const config = new DocumentBuilder()
    .setTitle('chatbot-api')
    .setDescription('The chatbot-api API description')
    .setVersion('1.0')
    .addBearerAuth( // <--- Wichtig
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT', // optional – ersetzt durch „API Key“ im UI
        name: 'Authorization',
        description: 'Gib deinen API Key ein (z. B. Bearer abc123)',
        in: 'header',
      },
      'api-key' // <--- Der Name der Security Definition
    )
    // .addSecurityRequirements(API_KEY_HEADER)
    .build();
  patchNestJsSwagger();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.listen(3000, '0.0.0.0');
  console.log('🚀 chatbot-api is running at http://localhost:3000');

  // await loadAndEmbedFromFile('kundendienst_qa_optionA_2000.json');
}
bootstrap();

// type FaqEntry = {
//   question: string;
//   answer: string;
// };

// const embedAndStore = async (content: string) => {
//   const vector = await generateEmbedding(content);
//   await saveEmbedding(content, vector);
// };

// async function loadAndEmbedFromFile(filePath: string) {
//   const data = await fs.readFile(filePath, 'utf-8');
//   const entries: FaqEntry[] = JSON.parse(data);
//
//   console.log(`📄 Lade ${entries.length} FAQs...`);
//
//   for (const item of entries) {
//     const content = `Frage: ${item.question}\nAntwort: ${item.answer}`;
//
//     try {
//       console.log(`🔄 Embed & speichere: "${item.question}"`);
//       await embedAndStore(content);
//     } catch (err) {
//       console.error(`❌ Fehler bei "${item.question}":`, err);
//     }
//   }
//
//   console.log('✅ Alle FAQs verarbeitet.');
// }

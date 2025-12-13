import { Controller, Get, Res } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Simple controller to serve static development files that live under src/.
 *
 * This is a minimal approach (no fastify-static plugin) that reads the file
 * from disk and returns it as text/html. It is intended for development/testing
 * convenience (e.g. serving `testAudio.html`).
 */
@Controller()
export class StaticController {
  @Get('testAudio.html')
  serveTestAudio(@Res() res: FastifyReply) {
    const filePath = path.resolve(process.cwd(), 'apps/chatbot-0-api/src/testAudio.html');
    console.log('Served testAudio.html:', filePath);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      res.type('text/html').send(content);
    } catch (error) {
      console.error('Failed to serve testAudio.html:', error);
      res.status(404).send('Not found');
    }
  }
}

import { Injectable } from '@nestjs/common';
import { callOpenAI } from '@chatbot-project-1/openai';
import { saveChat } from '@chatbot-project-1/db';

@Injectable()
export class ChatService {
  async processMessage(message: string): Promise<string> {
    const response = await callOpenAI(message);
    await saveChat(message, response);
    return response;
  }
}

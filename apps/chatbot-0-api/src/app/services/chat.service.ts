import { Injectable } from '@nestjs/common';
import { OpenAiService } from '@chatbot-project-1/openai';
import { saveChat } from '@chatbot-project-1/db';

@Injectable()
export class ChatService {
  constructor(private readonly openAiService: OpenAiService) {
  }
  async processMessage(message: string): Promise<string> {
    const response = await this.openAiService.callOpenAI(message);
    await saveChat(message, response);
    return response;
  }
}

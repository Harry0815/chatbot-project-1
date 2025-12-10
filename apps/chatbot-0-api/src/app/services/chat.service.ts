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

  async testSpeechToText() {
    const response = await this.openAiService.speechToText('test1.wav');
    return response;
  }

  async testTextToSpeech(message: string) {
    const response = await this.openAiService.textToSpeech(message);
    return response;
  }

  async testTranslateText(message: string) {
    const response = await this.openAiService.translateText(message, 'Englisch');
    return response;
  }
}

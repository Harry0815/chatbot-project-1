import { Injectable } from '@nestjs/common';
import { OpenAI } from 'openai';
import { createReadStream } from 'fs';
import fs from 'node:fs';

interface SocketlessTranslationOptions {
  sourceLanguage?: string;
  targetLanguage?: string;
  voice?: string;
}

@Injectable()
export class SocketlessRealTimeService {
  private readonly client = new OpenAI();

  async translateAudioFile(
    filePath: string,
    { sourceLanguage = 'auto', targetLanguage = 'en', voice = 'alloy' }: SocketlessTranslationOptions = {},
  ) {
    return this.processAudioSource(createReadStream(filePath), { sourceLanguage, targetLanguage, voice });
  }

  async translateAudioBuffer(
    buffer: Buffer,
    options: SocketlessTranslationOptions = {},
    filename = 'browser-input.wav',
  ) {
    const file = await fs.createReadStream(filename);
    return this.processAudioSource(file, options);
  }

  private async processAudioSource(
    file: NodeJS.ReadableStream,
    { sourceLanguage = 'auto', targetLanguage = 'en', voice = 'alloy' }: SocketlessTranslationOptions = {},
  ) {
    const transcription = await this.transcribe(file, sourceLanguage);
    const translation = await this.translate(transcription, targetLanguage);
    const audio = await this.synthesize(translation, voice);
    return { transcription, translation, audio };
  }

  private async transcribe(file: NodeJS.ReadableStream, language: string) {
    const response = await this.client.audio.transcriptions.create({
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      file,
      model: 'whisper-1',
      language,
    });
    return response.text ?? '';
  }

  private async translate(text: string, targetLanguage: string) {
    const response = await this.client.responses.create({
      model: 'gpt-4o-mini-transcribe:audio',
      input: [
        {
          role: 'system',
          content: `Übersetze ins ${targetLanguage} und liefere nur den übersetzten Text.`,
        },
        { role: 'user', content: text },
      ],
    });
    return response.output_text?.trim() ?? '';
  }

  private async synthesize(text: string, voice: string) {
    const response = await this.client.audio.speech.create({
      model: 'gpt-4o-mini-tts',
      input: text,
      voice,
    });
    return Buffer.from(await response.arrayBuffer());
  }
}

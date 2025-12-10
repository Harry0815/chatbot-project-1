import { OpenAI } from 'openai';
import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import FormData = require('form-data');
import fetch from 'node-fetch';

@Injectable()
export class OpenAiService {
  async callOpenAI(prompt: string): Promise<string> {
    const apiKey = process.env['OPENAI_API_KEY'];

    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is missing in .env');
    }

    const client = new OpenAI();

    const response = await client.responses.create({
      model: "gpt-5-nano",
      input: prompt
    })
    return response.output_text;
  }

  async speechToText(filePath: string) {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    const formData = new FormData();
    formData.append('file', fs.createReadStream(filePath));
    formData.append('model', 'whisper-1');

    // Optional:
    // formData.append('language', 'de');
    // formData.append('response_format', 'verbose_json');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        ...formData.getHeaders(), // wichtig!
      },
      body: formData,
    });

    const data = await res.json();
    console.log(data);
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    return data.text || data;
  }

  async textToSpeech(text: string, voice = 'nova') {
    const apiKey = process.env.OPENAI_API_KEY;

    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice, // nova, shimmer, onyx
        response_format: 'mp3',
      }),
    });

    if (!res.ok) {
      const error = await res.json();
      console.error('❌ TTS API Fehler:', error);
      throw new Error(error.toString());
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync('./output.mp3', buffer);
    console.log('✅ Audio gespeichert: output.mp3');
  }

  async translateText(input: string, targetLang: string): Promise<void> {
    const systemPrompt = `Übersetze den folgenden Text in ${targetLang}, aber erhalte den Sinn und Tonfall.`;

    const client = new OpenAI();
    const response = await client.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: input },
      ],
    });
    return await this.textToSpeech(response.choices[0].message.content.trim());
  }

}

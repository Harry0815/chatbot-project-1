import { EventEmitter } from 'events';
import WebSocket from 'ws';

// Lightweight interface describing the subset of the WS API this class uses.
export interface IWebSocket {
  on(event: string, listener: (...args: unknown[]) => void): void;
  send(data: string | ArrayBufferLike | Blob): void;
  close(): void;
  removeAllListeners?: () => void;
}

export interface RealtimeSessionOptions {
  model?: string;
  voice?: string;
  instructions?: string;
  inputSampleRate?: number;
  outputSampleRate?: number;
}

export type AudioDeltaPayload = {
  base64: string;
  format: string;
  sampleRate: number;
  responseId?: string;
};

const DEFAULT_OPTIONS: Required<Omit<RealtimeSessionOptions, 'instructions'>> & Pick<RealtimeSessionOptions, 'instructions'> = {
  model: 'gpt-4o-realtime-preview',
  voice: 'alloy',
  inputSampleRate: 16000,
  outputSampleRate: 16000,
  instructions: undefined,
};

/**
 * Helper class that encapsulates WebSocket interaction with OpenAI Realtime API.
 */
export class OpenAIRealtimeSocketHandler {
  ws!: IWebSocket;
  events: EventEmitter;
  private options: Required<RealtimeSessionOptions>;
  private awaitingResponse = false;
  private readyPromise: Promise<void> | null = null;

  constructor(opts?: RealtimeSessionOptions) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...opts,
      inputSampleRate: opts?.inputSampleRate ?? DEFAULT_OPTIONS.inputSampleRate,
      outputSampleRate: opts?.outputSampleRate ?? DEFAULT_OPTIONS.outputSampleRate,
      voice: opts?.voice ?? DEFAULT_OPTIONS.voice,
      model: opts?.model ?? DEFAULT_OPTIONS.model,
      instructions: opts?.instructions ?? DEFAULT_OPTIONS.instructions,
    } as Required<RealtimeSessionOptions>;
    this.events = new EventEmitter();
  }

  connectToAudioStream(): Promise<void> {
    const rawWs = new WebSocket(`wss://api.openai.com/v1/realtime?model=${this.options.model}`, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
    });

    // Cast the raw WebSocket to our lightweight IWebSocket so we can call .on(...)
    this.ws = rawWs as unknown as IWebSocket;
    this.attachHandlers();
    this.readyPromise = new Promise((resolve, reject) => {
      const handleOpen = () => {
        cleanup();
        resolve();
      };
      const handleError = (err: unknown) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        if (typeof (this.ws as WebSocket).removeListener === 'function') {
          (this.ws as WebSocket).removeListener('open', handleOpen);
          (this.ws as WebSocket).removeListener('error', handleError);
        }
      };

      this.ws.on('open', handleOpen);
      this.ws.on('error', handleError);
    });
    return this.readyPromise;
  }

  async waitUntilReady() {
    if (!this.readyPromise) {
      await this.connectToAudioStream();
      return;
    }
    await this.readyPromise;
  }

  /** Attach WebSocket event listeners and forward parsed messages via events. */
  private attachHandlers() {
    this.ws.on('open', () => this.handleOpen());
    this.ws.on('message', (data: unknown) => this.handleMessage(data));
    this.ws.on('close', (code: number, reason: Buffer) => {
      this.events.emit('close', { code, reason });
    });
    this.ws.on('error', (err: unknown) => {
      this.events.emit('error', err);
    });
  }

  private handleOpen() {
    this.sendSessionCreate();
  }

  /** Send the session.create message required by the OpenAI realtime endpoint. */
  private sendSessionCreate() {
    this.ws.send(JSON.stringify({
      type: 'session.create',
      session: {
        model: this.options.model,
        modalities: ['text', 'audio'],
        voice: this.options.voice,
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          silence_duration_ms: 400,
        },
        audio: {
          input: {
            format: 'pcm16',
            sample_rate: this.options.inputSampleRate,
          },
          output: {
            format: 'pcm16',
            sample_rate: this.options.outputSampleRate,
            voice: this.options.voice,
          },
        },
      },
    }));
  }

  /** Create a response request so OpenAI starts streaming translation output */
  public requestResponse(extraInstructions?: string) {
    const instructions = extraInstructions ?? this.options.instructions ?? 'Translate the incoming speech to fluent English and keep the same tone.';
    this.awaitingResponse = true;
    this.ws.send(JSON.stringify({
      type: 'response.create',
      response: {
        instructions,
        modalities: ['text', 'audio'],
        audio: {
          format: 'pcm16',
          voice: this.options.voice,
          sample_rate: this.options.outputSampleRate,
        },
      },
    }));
  }

  public markResponseComplete() {
    this.awaitingResponse = false;
  }

  public isAwaitingResponse() {
    return this.awaitingResponse;
  }

  /**
   * Handle incoming raw WebSocket messages, parse and emit higher-level events.
   */
  private handleMessage(data: unknown) {
    let msg: Record<string, unknown> | undefined;
    try {
      const str = typeof data === 'string' ? data : (data instanceof ArrayBuffer ? Buffer.from(data).toString() : undefined);
      if (str === undefined) {
        this.events.emit('raw', data);
        return;
      }
      msg = JSON.parse(str);
    } catch (err) {
      this.events.emit('raw', data);
      return;
    }

    if (!msg || typeof msg.type !== 'string') {
      this.events.emit('raw', msg);
      return;
    }

    const { type } = msg;

    if (type === 'response.output_text.delta' && typeof msg.delta === 'string') {
      this.events.emit('transcript', msg.delta);
      return;
    }

    if (type === 'response.output_audio.delta' && typeof msg.delta === 'string') {
      const payload: AudioDeltaPayload = {
        base64: msg.delta,
        format: typeof msg.audio_format === 'string' ? msg.audio_format : 'pcm16',
        sampleRate: typeof msg.sample_rate === 'number' ? msg.sample_rate : this.options.outputSampleRate,
        responseId: typeof msg.response_id === 'string' ? msg.response_id : undefined,
      };
      this.events.emit('audio.output', payload);
      return;
    }

    if (type === 'response.completed') {
      this.markResponseComplete();
      this.events.emit('response.complete', msg);
      return;
    }

    if (type === 'error') {
      this.events.emit('error', msg);
      return;
    }

    this.events.emit('raw', msg);
  }

  public sendAudioChunk(buffer: Buffer) {
    this.ws.send(JSON.stringify({
      type: 'input_audio_buffer.append',
      audio: buffer.toString('base64'),
    }));
  }

  public commitAudio() {
    this.ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
  }

  public close() {
    try {
      this.ws.close();
    } catch (err) {
      console.debug(err);
    }
  }
}

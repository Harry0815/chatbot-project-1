import { Injectable } from '@nestjs/common';
import WebSocket from "ws";
import fs from 'node:fs';
import decodeAudio from 'audio-decode';
import wrtc from 'wrtc';
import { realtimeResponseEventSchema, RealtimeResponseEvent } from './models';

const AUDIO_COMMIT_DEBOUNCE_MS = Number(process.env.REALTIME_COMMIT_DEBOUNCE_MS ?? 900);

type AudioSinkHandle = { ondata?: (d: Record<string, unknown>) => void; stop?: () => void };
type AudioSourceHandle = {
  createTrack: () => MediaStreamTrackLike;
  onData: (data: {
    samples: Int16Array;
    sampleRate: number;
    bitsPerSample: number;
    channelCount: number;
    numberOfFrames: number;
  }) => void;
  close?: () => void;
};
type MediaStreamTrackLike = { stop?: () => void } & Record<string, unknown>;
type RTCNonstandard = {
  RTCAudioSink?: new (track: unknown) => AudioSinkHandle;
  RTCAudioSource?: new () => AudioSourceHandle;
};
type DataChannelLike = {
  readyState?: 'connecting' | 'open' | 'closing' | 'closed';
  send?: (data: string) => void;
  close?: () => void;
};
type SessionResources = {
  pc: wrtc.RTCPeerConnection;
  ws?: WebSocket;
  messageQueue: string[];
  downstreamAudio?: { source: AudioSourceHandle; track: MediaStreamTrackLike };
  dataChannel?: DataChannelLike;
  translationStream?: wrtc.MediaStream;
  awaitingResponse?: boolean;
  commitTimer?: NodeJS.Timeout;
};

const nonstandard = (wrtc as unknown as { nonstandard?: RTCNonstandard }).nonstandard;
const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL ?? 'gpt-realtime';
const TRANSLATION_PROMPT =
  process.env.REALTIME_TRANSLATION_PROMPT ??
  'Translate every user utterance into English and answer only with the concise English translation.';
const TRANSLATION_VOICE = process.env.REALTIME_TRANSLATION_VOICE ?? 'alloy';
const OPENAI_AUDIO_SAMPLE_RATE = 24000;
const BROWSER_AUDIO_SAMPLE_RATE = 48000;
const DOWNSTREAM_FRAME_SIZE = 480; // 10 ms @ 48 kHz, von RTCAudioSource erwartet
const REALTIME_URL = `wss://api.openai.com/v1/realtime?model=${REALTIME_MODEL}`;
const LOOPBACK_MODE = false;    // (process.env.REALTIME_LOOPBACK ?? 'true').toLowerCase() === 'true';

const buildTranslationResponseRequest = () => ({
  type: 'response.create',
  response: {
    modalities: ['text', 'audio'],
    instructions: TRANSLATION_PROMPT,
    audio: {
      voice: TRANSLATION_VOICE,
      format: 'pcm16',
    },
  },
});

const decodeBase64Pcm16 = (payload: unknown): Int16Array | null => {
  if (typeof payload !== 'string' || !payload.length) return null;
  const buffer = Buffer.from(payload, 'base64');
  return new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2);
};

const upsampleToClientRate = (chunk: Int16Array): Int16Array => {
  // if (BROWSER_AUDIO_SAMPLE_RATE === OPENAI_AUDIO_SAMPLE_RATE) {
  //   return chunk;
  // }
  const ratio = BROWSER_AUDIO_SAMPLE_RATE / OPENAI_AUDIO_SAMPLE_RATE;
  if (!Number.isInteger(ratio) || ratio <= 1) {
    return chunk;
  }
  const result = new Int16Array(chunk.length * ratio);
  for (let i = 0; i < chunk.length; i++) {
    const sample = chunk[i];
    for (let r = 0; r < ratio; r++) {
      result[i * ratio + r] = sample;
    }
  }
  return result;
};


@Injectable()
export class RealTimeService {

  // Map, um aktive Sessions zu verwalten (sessionId -> resources)
  private sessions: Map<string, SessionResources> = new Map();

  private createDownstreamAudioTrack(pc: wrtc.RTCPeerConnection) {
    if (!nonstandard?.RTCAudioSource) return undefined;
    const source = new nonstandard.RTCAudioSource();
    const track = source.createTrack();
    const stream = new wrtc.MediaStream();
    stream.addTrack(track as never);
    pc.addTrack(track, stream);
    return { source, track, translationStream: stream };
  }

  private async acceptOffer(pc: wrtc.RTCPeerConnection, offer: unknown) {
    if (typeof offer !== 'object' || offer === null) {
      throw new Error('Invalid offer object');
    }
    const description = offer as Record<string, unknown>;
    const type = typeof description['type'] === 'string' ? (description['type'] as string) : 'offer';
    const sdp = typeof description['sdp'] === 'string' ? (description['sdp'] as string) : undefined;
    await pc.setRemoteDescription({ type, sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer as unknown as { type: string; sdp?: string });
    return pc.localDescription as { type: string; sdp?: string };
  }

  private setupLoopbackPipeline(
    pc: wrtc.RTCPeerConnection,
    downstream: { source: AudioSourceHandle }
  ) {
    const RTCAudioSink = nonstandard?.RTCAudioSink;
    if (!RTCAudioSink) {
      throw new Error('Loopback mode requires wrtc.nonstandard.RTCAudioSink');
    }

    pc.ontrack = (event: { track?: MediaStreamTrackLike }) => {
      const track = event.track;
      if (!track) return;
      const sink = new RTCAudioSink(track);

      sink.ondata = (data: { samples?: Int16Array | Float32Array; sampleRate?: number }) => {
        const samples = data.samples;
        if (!samples) return;
        let pcm16: Int16Array;
        if (samples instanceof Int16Array) {
          pcm16 = samples;
        } else {
          const floats = samples as Float32Array;
          pcm16 = new Int16Array(floats.length);
          for (let i = 0; i < floats.length; i++) {
            const s = Math.max(-1, Math.min(1, floats[i]));
            pcm16[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
          }
        }
        console.log('[Loopback] received samples=', pcm16.length, pcm16);
        downstream.source.onData({
          samples: pcm16,
          sampleRate: data.sampleRate ?? BROWSER_AUDIO_SAMPLE_RATE,
          bitsPerSample: 16,
          channelCount: 1,
          numberOfFrames: pcm16.length,
        });
      };

      (track as { onended?: () => void }).onended = () => {
        try {
          sink.stop?.();
        } catch (err) {
          console.warn('Loopback sink stop failed:', err);
        }
      };
    };
  }

  async openConnection() {
    const ws = new WebSocket(REALTIME_URL, {
      headers: {
        Authorization: "Bearer " + process.env.OPENAI_API_KEY,
      },
    });

    ws.on("open", function open() {
      console.log("Connected to server.");
    });

    ws.on("message", function incoming(message) {
      try {
        console.log(JSON.parse(message.toString()));
      } catch (err) {
        console.log('Non-JSON message received:', message.toString(), 'parse error:', err);
      }
    });
  }

  async streamToServer(files?: string[]) {
    const ws = new WebSocket(REALTIME_URL, {
      headers: {
        Authorization: "Bearer " + process.env.OPENAI_API_KEY,
      },
    });

    ws.on('open', async function open() {
      console.log('Connected to server.');
      const fileList = files && files.length ? files : ['./test1.wav'];

      // Converts Float32Array of audio data to a Node Buffer containing PCM16 (little-endian)
      const floatTo16BitPCM = (float32Array: Float32Array): Buffer => {
        const buffer = Buffer.alloc(float32Array.length * 2);
        for (let i = 0; i < float32Array.length; i++) {
          const s = Math.max(-1, Math.min(1, float32Array[i]));
          // writeInt16LE expects an integer; multiply by 0x7fff (32767) for positive, 0x8000 (32768) for negative
          const int16 = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
          buffer.writeInt16LE(int16, i * 2);
        }
        return buffer;
      };

      // Encode Float32Array audio to base64 using Buffer (Node.js-safe)
      const base64EncodeAudio = (float32Array: Float32Array): string => {
        const pcmBuffer = floatTo16BitPCM(float32Array);
        return pcmBuffer.toString('base64');
      };

      for (const filename of fileList) {
        try {
          const audioFile = fs.readFileSync(filename);
          const audioBuffer = await decodeAudio(audioFile);
          const channelData = audioBuffer.getChannelData(0) as Float32Array;
          const base64Chunk = base64EncodeAudio(channelData);

          ws.send(
            JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: base64Chunk,
            })
          );
        } catch (err) {
          console.error('Failed to read/encode file', filename, err);
        }
      }

      ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
      ws.send(JSON.stringify(buildTranslationResponseRequest()));
    });

    ws.on("message", function incoming(message) {
      try {
        console.log(JSON.parse(message.toString()));
      } catch (err) {
        console.log('Non-JSON message received:', message.toString(), 'parse error:', err);
      }
    });

    ws.on('error', (err) => {
      console.error('WebSocket error:', err);
    });

    ws.on('close', (code, reason) => {
      console.log('WebSocket closed:', code, reason && reason.toString());
    });

  }

  async handleOffer(offer: unknown): Promise<{ answer: { type: string; sdp?: string } | null; sessionId: string }> {
    const pc = new wrtc.RTCPeerConnection();
    const translationChannel = pc.createDataChannel('translation', { ordered: true });
    translationChannel.onopen = () => console.log('Translation datachannel opened');
    translationChannel.onclose = () => console.log('Translation datachannel closed');
    translationChannel.onerror = (err) => console.error('Translation datachannel error:', err);
    const downstreamAudio = nonstandard?.RTCAudioSource
      ? (() => {
          const source = new nonstandard.RTCAudioSource();
          const track = source.createTrack();
          const translationStream = new wrtc.MediaStream();
          translationStream.addTrack(track as never);
          pc.addTrack(track, translationStream);
          console.log('Attached downstream translation audio track');
          return { source, track, translationStream };
        })()
      : undefined;
    console.log(downstreamAudio);
    if (LOOPBACK_MODE) {
      if (!downstreamAudio) {
        throw new Error('Loopback mode requires RTCAudioSource support in wrtc.nonstandard');
      }
      const sessionId = Math.random().toString(36).slice(2, 10);
      this.sessions.set(sessionId, {
        pc,
        messageQueue: [],
        downstreamAudio,
        translationStream: downstreamAudio.translationStream,
      });
      this.setupLoopbackPipeline(pc, downstreamAudio);
      const answer = await this.acceptOffer(pc, offer);
      return { answer, sessionId };
    }

    // Open websocket to OpenAI realtime endpoint
    const ws = new WebSocket(REALTIME_URL, {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    });

    this.createDownstreamAudioTrack(pc);

    // Per-session message queue
    const messageQueue: string[] = [];
    const MAX_QUEUE = 200; // prevent unbounded memory growth
    const sendOrQueue = (msgObj: unknown) => {
      try {
        const payload = typeof msgObj === 'string' ? msgObj : JSON.stringify(msgObj);
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(payload);
            if (messageQueue.length)
              console.debug('[OpenAI WS] sent message, queueLen=', messageQueue.length);
          } catch (err) {
            console.warn('[OpenAI WS] send failed, queuing payload, readyState=', ws.readyState, 'err=', err);
            if (messageQueue.length >= MAX_QUEUE) {
              messageQueue.shift();
            }
            messageQueue.push(payload);
          }
        } else {
          if (messageQueue.length >= MAX_QUEUE) {
            console.warn('OpenAI WS queue full - dropping oldest message');
            messageQueue.shift();
          }
          messageQueue.push(payload);
          console.debug('[OpenAI WS] queued message, readyState=', ws.readyState, 'queueLen=', messageQueue.length);
        }
      } catch (err) {
        console.error('Failed to queue/send message to OpenAI WS:', err);
      }
    };

    const emitTranscriptDelta = (delta: unknown) => {
      if (!translationChannel || translationChannel.readyState !== 'open') return;
      let text = '';
      if (typeof delta === 'string') {
        text = delta;
      } else if (delta && typeof delta === 'object' && typeof (delta as Record<string, unknown>).text === 'string') {
        text = (delta as Record<string, unknown>).text as string;
      }
      if (!text.trim()) return;
      try {
        translationChannel.send(JSON.stringify({ type: 'transcript', delta: text }));
      } catch (err) {
        console.error('Failed to forward transcript delta:', err);
      }
    };

    const forwardAudioDelta = (delta: unknown) => {
      if (!downstreamAudio) return;
      let audioPayload: string | null = null;
      if (typeof delta === 'string') {
        audioPayload = delta;
      } else if (delta && typeof delta === 'object' && typeof (delta as Record<string, unknown>).audio === 'string') {
        audioPayload = (delta as Record<string, unknown>).audio as string;
      }
      if (!audioPayload) return;

      const samples = decodeBase64Pcm16(audioPayload);
      console.debug('[Realtime] audio delta samples=', samples?.length);
      if (!samples || samples.length === 0) return;

      const resampled = upsampleToClientRate(samples);
      console.debug('[Realtime] resampled samples=', resampled.length);

      const deliverFrame = (frame: Int16Array) => {
        console.log('[Realtime] delivering frame samples=', frame.length);
        try {
          downstreamAudio.source.onData({
            samples: frame,
            sampleRate: BROWSER_AUDIO_SAMPLE_RATE,
            bitsPerSample: 16,
            channelCount: 1,
            numberOfFrames: DOWNSTREAM_FRAME_SIZE,
          });
        } catch (err) {
          console.log('Failed to stream translation audio to browser:', err.message);
          // console.error('Failed to stream translation audio to browser:', err.message);
        }
      };
      for (let offset = 0; offset < resampled.length; offset += DOWNSTREAM_FRAME_SIZE) {
        const end = Math.min(resampled.length, offset + DOWNSTREAM_FRAME_SIZE);
        if (end - offset === DOWNSTREAM_FRAME_SIZE) {
          deliverFrame(resampled.subarray(offset, end));
        } else {
          const padded = new Int16Array(DOWNSTREAM_FRAME_SIZE);
          padded.set(resampled.subarray(offset, end));
          deliverFrame(padded);
        }
      }
    };

    const handleRealtimeEvent = (event: RealtimeResponseEvent) => {
      console.debug('[Realtime] event', event.type);
      switch (event.type) {
        case 'response.output_text.delta':
          emitTranscriptDelta(event.delta);
          break;
        case 'response.output_audio.delta':
          forwardAudioDelta(event.delta);
          break;
        case 'response.completed':
        case 'response.canceled':
        case 'response.failed':
        case 'response.error':
          if (session) session.awaitingResponse = false;
          break;
        default:
          break;
      }
    };

    ws.on('open', () => {
      console.log('WebSocket to OpenAI opened from handleOffer');
      try {
        for (const m of messageQueue) ws.send(m);
      } catch (err) {
        console.error('Failed to flush OpenAI WS queue:', err);
      }
      messageQueue.length = 0;
    });

    // store session resources so stopSession später Zugriff hat
    const sessionId = Math.random().toString(36).slice(2, 10);
    const session: SessionResources = {
       pc,
       ws,
       messageQueue,
       downstreamAudio,
       dataChannel: translationChannel,
       translationStream: downstreamAudio?.translationStream,
       awaitingResponse: false,
    };
    this.sessions.set(sessionId, session);

    // Helper to wait for ws open (returns true if open, false if timed out)
    const waitForWsOpen = (timeoutMs = 5000): Promise<boolean> => {
      if (ws.readyState === WebSocket.OPEN) return Promise.resolve(true);
      return new Promise((resolve) => {
        const onOpen = () => {
          cleanup();
          resolve(true);
        };
        const onCloseOrError = () => {
          cleanup();
          resolve(false);
        };
        const to = setTimeout(() => {
          cleanup();
          resolve(false);
        }, timeoutMs);
        function cleanup() {
          clearTimeout(to);
          ws.off('open', onOpen);
          ws.off('close', onCloseOrError);
          ws.off('error', onCloseOrError);
        }
        ws.on('open', onOpen);
        ws.on('close', onCloseOrError);
        ws.on('error', onCloseOrError);
      });
    };

    ws.on('message', (message) => {
      try {
        const parsed = JSON.parse(message.toString());
        const msg = realtimeResponseEventSchema.safeParse(parsed);
        if (!msg.success) return;
        handleRealtimeEvent(msg.data);
      } catch (err) {
        console.log('Non-JSON message from OpenAI:', message.toString(), err);
      }
    });

    ws.on('error', (err) => {
      console.error('OpenAI WS error:', err);
      // Optionally clear queue on error to avoid memory growth
      messageQueue.length = 0;
    });
    ws.on('close', (code, reason) => {
      console.log('OpenAI WS closed', code, reason && reason.toString());
      // clear queue to avoid stale messages
      messageQueue.length = 0;
    });

    // Helper to convert incoming samples to PCM16 base64
    const samplesToBase64 = (samples: unknown): string => {
      if (!samples) return '';

      if (samples instanceof Int16Array) {
        return Buffer.from(samples.buffer).toString('base64');
      }

      if (samples instanceof Float32Array) {
        const f32 = samples as Float32Array;
        const buf = Buffer.alloc(f32.length * 2);
        for (let i = 0; i < f32.length; i++) {
          const s = Math.max(-1, Math.min(1, f32[i]));
          const int16 = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
          buf.writeInt16LE(int16, i * 2);
        }
        return buf.toString('base64');
      }

      if (samples instanceof Int32Array) {
        const i32 = samples as Int32Array;
        // downmix/convert to Int16
        const buf = Buffer.alloc(i32.length * 2);
        for (let i = 0; i < i32.length; i++) {
          const s = Math.max(-1, Math.min(1, i32[i] / 2147483648));
          const int16 = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
          buf.writeInt16LE(int16, i * 2);
        }
        return buf.toString('base64');
      }

      // Attempt to handle generic ArrayBufferViews
      if (ArrayBuffer.isView(samples)) {
        const view = samples as ArrayBufferView;
        try {
          return Buffer.from((view as ArrayBufferView).buffer).toString('base64');
        } catch (err) {
          console.error('Failed to coerce ArrayBufferView to Buffer:', err);
          return '';
        }
      }

      return '';
    };

    // When track arrives, attach RTCAudioSink to receive samples
    pc.ontrack = (event: unknown) => {
      try {
        const ev = event as { track?: { kind?: string; onended?: () => void } & Record<string, unknown> };
        const track = ev.track;
        if (!track) return;
        console.log('Server PC received track:', track.kind);

        const RTCAudioSink = nonstandard?.RTCAudioSink;
        if (track.kind === 'audio' && RTCAudioSink) {
          const SinkCtor = RTCAudioSink as unknown as new (t: unknown) => { ondata?: (d: unknown) => void; stop?: () => void };
          const sink = new SinkCtor(track);

          const scheduleCommit = () => {
            const currentSession = this.sessions.get(sessionId);
            if (!currentSession) return;
            if (currentSession.commitTimer) {
              clearTimeout(currentSession.commitTimer);
            }
            currentSession.commitTimer = setTimeout(() => {
              currentSession.commitTimer = undefined;
              sendOrQueue({ type: 'input_audio_buffer.commit' });
              if (!currentSession.awaitingResponse) {
                currentSession.awaitingResponse = true;
                sendOrQueue(buildTranslationResponseRequest());
              }
            }, AUDIO_COMMIT_DEBOUNCE_MS);
          };

          sink.ondata = (data: unknown) => {
            try {
              const d = data as Record<string, unknown>;
              const samples = d['samples'];
              const base64 = samplesToBase64(samples);
              if (base64) {
                sendOrQueue({ type: 'input_audio_buffer.append', audio: base64 });
                scheduleCommit();
              }
            } catch (err) {
              console.error('Error handling sink.ondata:', err);
            }
          };

          // when track ends, finalize
          (track as { onended?: () => void }).onended = () => {
            console.log('Track ended, committing and requesting response');
            sendOrQueue({ type: 'input_audio_buffer.commit' });
            sendOrQueue(buildTranslationResponseRequest());
            try {
              sink.stop?.();
            } catch (err) {
              console.error('Failed to stop sink:', err);
            }
          };
        } else {
          console.warn('Unexpected track kind ? or AudioSink :', track.kind);
        }
      } catch (err) {
        console.error('Failed to attach RTCAudioSink:', err);
      }
    };

    // Validate and set remote (client) offer and create answer
    if (typeof offer !== 'object' || offer === null) {
      throw new Error('Invalid offer object');
    }
    const o = offer as Record<string, unknown>;
    const offerType = typeof o['type'] === 'string' ? o['type'] : 'offer';
    const offerSdp = typeof o['sdp'] === 'string' ? o['sdp'] : undefined;

    await pc.setRemoteDescription({ type: offerType, sdp: offerSdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer as unknown as { type: string; sdp?: string });

    // Wait briefly for the OpenAI WS to open so initial audio/chunks won't be dropped
    const opened = await waitForWsOpen(5000);
    if (!opened) {
      console.warn('OpenAI WebSocket did not open within timeout; audio will be queued until it opens or may be dropped if connection fails');
    }

    return { answer: pc.localDescription as { type: string; sdp?: string }, sessionId };
  }

  // Stop a running session: schließt PeerConnection und WebSocket und bereinigt die Session
  async stopSession(sessionId: string): Promise<void> {
    const entry = this.sessions.get(sessionId);
    if (!entry) {
      console.warn('stopSession called with unknown sessionId:', sessionId);
      return;
    }

    try {
      try {
        entry.dataChannel?.close?.();
      } catch (e) {
        console.error('Error closing data channel for session', sessionId, e);
      }

      try {
        entry.downstreamAudio?.track?.stop?.();
        entry.downstreamAudio?.source?.close?.();
        entry.translationStream?.getTracks?.().forEach((t) => t.stop?.());
      } catch (e) {
        console.error('Error stopping downstream audio for session', sessionId, e);
      }

      try {
        entry.pc?.close();
      } catch (e) {
        console.error('Error closing PeerConnection for session', sessionId, e);
      }

      try {
        entry.ws?.close?.();
      } catch (e) {
        console.error('Error closing WebSocket for session', sessionId, e);
      }

      // clear queue and delete session
      entry.messageQueue.length = 0;
      this.sessions.delete(sessionId);
      console.log('Stopped session', sessionId);
    } catch (err) {
      console.error('Failed to stop session', sessionId, err);
    }
  }

}

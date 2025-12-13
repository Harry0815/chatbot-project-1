import { Injectable } from '@nestjs/common';
import WebSocket from "ws";
import fs from 'node:fs';
import decodeAudio from 'audio-decode';
import wrtc from 'wrtc';


@Injectable()
export class RealTimeService {

  // Map, um aktive Sessions zu verwalten (sessionId -> resources)
  private sessions: Map<string, { pc: unknown; ws: WebSocket; messageQueue: string[] }> = new Map();

  async openConnection() {
    const url = "wss://api.openai.com/v1/realtime?model=gpt-realtime";
    const ws = new WebSocket(url, {
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
    const url = "wss://api.openai.com/v1/realtime?model=gpt-realtime";
    const ws = new WebSocket(url, {
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
      ws.send(JSON.stringify({ type: 'response.create' }));
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

    // Open websocket to OpenAI realtime endpoint
    const url = "wss://api.openai.com/v1/realtime?model=gpt-realtime";
    const ws = new WebSocket(url, {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    });

    // Per-session message queue
    const messageQueue: string[] = [];
    const MAX_QUEUE = 200; // prevent unbounded memory growth
    const sendOrQueue = (msgObj: unknown) => {
      try {
        const payload = typeof msgObj === 'string' ? msgObj : JSON.stringify(msgObj);
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(payload);
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

    ws.on('open', () => {
      console.log('WebSocket to OpenAI opened from handleOffer');
      try {
        for (const m of messageQueue) ws.send(m);
      } catch (err) {
        console.error('Failed to flush OpenAI WS queue:', err);
      }
      messageQueue.length = 0;
    });

    // store session resources so stopSession later Zugriff hat
    const sessionId = Math.random().toString(36).slice(2, 10);
    this.sessions.set(sessionId, { pc, ws, messageQueue });

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
        console.log('OpenAI WS message:', JSON.parse(message.toString()));
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

        // Access nonstandard RTCAudioSink in a typesafe way
        const nonstandard = (wrtc as unknown as { nonstandard?: { RTCAudioSink?: new (track: unknown) => { ondata?: (d: unknown) => void; stop?: () => void } } }).nonstandard;
        const RTCAudioSink = nonstandard?.RTCAudioSink;
        if (track.kind === 'audio' && RTCAudioSink) {
          const SinkCtor = RTCAudioSink as unknown as new (t: unknown) => { ondata?: (d: unknown) => void; stop?: () => void };
          const sink = new SinkCtor(track);

          sink.ondata = (data: unknown) => {
            try {
              const d = data as Record<string, unknown>;
              const samples = d['samples'];
              const base64 = samplesToBase64(samples);
              if (base64) sendOrQueue({ type: 'input_audio_buffer.append', audio: base64 });
            } catch (err) {
              console.error('Error handling sink.ondata:', err);
            }
          };

          // when track ends, finalize
          (track as { onended?: () => void }).onended = () => {
            console.log('Track ended, committing and requesting response');
            sendOrQueue({ type: 'input_audio_buffer.commit' });
            sendOrQueue({ type: 'response.create' });
            try {
              sink.stop?.();
            } catch (err) {
              console.error('Failed to stop sink:', err);
            }
          };
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
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        entry.pc?.close?.();
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

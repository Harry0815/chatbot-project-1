import { Injectable } from '@nestjs/common';
import {
  OpenAIRealtimeSocketHandler,
  AudioDeltaPayload,
} from '../helper/OpenAISocketHandler';
import {
  RTCPeerConnection,
  MediaStream,
  MediaStreamTrack,
  RTCDataChannel,
  nonstandard,
} from 'wrtc';

const { RTCAudioSink, RTCAudioSource } = nonstandard;

type SinkFrame = {
  samples: Buffer;
  sampleRate: number;
  bitsPerSample: number;
  channelCount: number;
  numberOfFrames: number;
};

@Injectable()
export class RealTimeService {
  private static readonly OPENAI_INPUT_SAMPLE_RATE = 16000;
  private static readonly WEBRTC_SAMPLE_RATE = 48000;
  private static readonly OPENAI_OUTPUT_SAMPLE_RATE = 16000;
  private static readonly AUDIO_COMMIT_INTERVAL_MS = 350;

  handler: OpenAIRealtimeSocketHandler;
  pc: RTCPeerConnection;

  constructor() {
    // this.handler = new OpenAIRealtimeSocketHandler({
    //   instructions: 'Translate the caller speech into natural English and stream the result instantly.',
    //   inputSampleRate: RealTimeService.OPENAI_INPUT_SAMPLE_RATE,
    //   outputSampleRate: RealTimeService.OPENAI_OUTPUT_SAMPLE_RATE,
    //   voice: 'alloy',
    // });

    this.handler = new OpenAIRealtimeSocketHandler();

    this.handler.connectToAudioStream().then(() => {
      console.log('connected to audio stream');
    });

    this.handler.ws.on('open', (err) => {
      console.log('Realtime WS open', err);
      // Send client events over the WebSocket once connected
      this.handler.ws.send(
        JSON.stringify({
          type: "session.update",
          session: {
            type: "realtime",
            instructions: "Be extra nice today!",
          },
        })
      );
    });

    // Listen for and parse server events
    this.handler.ws.on("message", function incoming(message) {
      console.log('ws bekommt: ', JSON.parse(message.toString()));
    });

    this.pc = new RTCPeerConnection();

    const translationSource = new RTCAudioSource();
    const outboundTrack = translationSource.createTrack();
    const outboundStream = new MediaStream([outboundTrack]);
    this.pc.addTrack(outboundTrack, outboundStream);

    const transcriptChannel = this.pc.createDataChannel('translation');
    transcriptChannel.onopen = () => console.log('📡 Translation data channel open');
    transcriptChannel.onclose = () => console.log('📡 Translation data channel closed');

    this.pc.ontrack = async (event) => {
      const [audioTrack] = event.streams[0].getAudioTracks();
      if (!audioTrack) {
        return;
      }
      await this.proxyMediaToOpenAI(audioTrack, translationSource, transcriptChannel);
      console.log('proxy media to OpenAI: ', audioTrack.kind, audioTrack.label, audioTrack.id);
    };

    this.pc.oniceconnectionstatechange = () => {
      if (['failed', 'disconnected', 'closed'].includes(this.pc.iceConnectionState)) {
        outboundTrack.stop();
      }
    };
  }
  async handleOffer(offer: RTCSessionDescriptionInit): Promise<{ answer: RTCSessionDescriptionInit }> {
    const serverEvent = JSON.parse(offer.sdp);
    if (serverEvent.type === "response.audio.delta") {
      // Access Base64-encoded audio chunks
      // console.log(serverEvent.delta);
    }

    // return;
    // const pc = new RTCPeerConnection();
    //
    // const translationSource = new RTCAudioSource();
    // const outboundTrack = translationSource.createTrack();
    // const outboundStream = new MediaStream([outboundTrack]);
    // pc.addTrack(outboundTrack, outboundStream);
    //
    // const transcriptChannel = pc.createDataChannel('translation');
    // transcriptChannel.onopen = () => console.log('📡 Translation data channel open');
    // transcriptChannel.onclose = () => console.log('📡 Translation data channel closed');
    //
    // pc.ontrack = async (event) => {
    //   const [audioTrack] = event.streams[0].getAudioTracks();
    //   if (!audioTrack) {
    //     return;
    //   }
    //   await this.proxyMediaToOpenAI(audioTrack, translationSource, transcriptChannel);
    //   console.log('proxy media to OpenAI: ', audioTrack.kind, audioTrack.label, audioTrack.id);
    // };
    //
    // pc.oniceconnectionstatechange = () => {
    //   if (['failed', 'disconnected', 'closed'].includes(pc.iceConnectionState)) {
    //     outboundTrack.stop();
    //   }
    // };

    await this.pc.setRemoteDescription(offer);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    return { answer: this.pc.localDescription };
  }

  private async proxyMediaToOpenAI(
    audioTrack: MediaStreamTrack,
    outboundSource: InstanceType<typeof RTCAudioSource>,
    transcriptChannel?: RTCDataChannel,
  ) {
    const sink = new RTCAudioSink(audioTrack);
    // const handler = new OpenAIRealtimeSocketHandler({
    //   instructions: 'Translate the caller speech into natural English and stream the result instantly.',
    //   inputSampleRate: RealTimeService.OPENAI_INPUT_SAMPLE_RATE,
    //   outputSampleRate: RealTimeService.OPENAI_OUTPUT_SAMPLE_RATE,
    //   voice: 'alloy',
    // });
    // handler.connectToAudioStream().then(() => {
    //   console.log('connected to audio stream');
    // });

    let lastCommit = Date.now();
    let pendingBytes = 0;

    sink.ondata = (frame: SinkFrame) => {
      const pcm16 = this.preparePcmChunk(frame);
      if (!pcm16.length) {
        return;
      }
      this.handler.sendAudioChunk(pcm16);
      pendingBytes += pcm16.length;

      const now = Date.now();
      const shouldCommit = now - lastCommit >= RealTimeService.AUDIO_COMMIT_INTERVAL_MS || pendingBytes > RealTimeService.OPENAI_INPUT_SAMPLE_RATE * 2;
      if (shouldCommit) {
        this.handler.commitAudio();
        pendingBytes = 0;
        lastCommit = now;
        if (!this.handler.isAwaitingResponse()) {
          this.handler.requestResponse();
        }
      }
    };

    sink.onended = () => cleanup();
    sink.onstopped = () => cleanup();

    const cleanup = () => {
      try {
        sink.stop();
      } catch (err) {
        console.debug(err);
      }
      this.handler.close();
    };

    audioTrack.addEventListener?.('ended', cleanup as () => void);

    this.handler.events.on('transcript', (delta) => this.emitTranscript(transcriptChannel, delta));
    this.handler.events.on('audio.output', (payload: AudioDeltaPayload) => {
      this.forwardAudioToPeer(payload, outboundSource);
    });
    this.handler.events.on('response.complete', () => {
      this.emitStatus(transcriptChannel, 'complete');
    });
    this.handler.events.on('error', (err) => {
      console.error('Realtime WS error', err);
      this.emitStatus(transcriptChannel, 'error');
    });
  }

  private emitTranscript(channel: RTCDataChannel | undefined, delta: unknown) {
    if (!channel || channel.readyState !== 'open') {
      return;
    }
    console.log('emit transcript:')
    channel.send(JSON.stringify({ type: 'transcript', delta }));
  }

  private emitStatus(channel: RTCDataChannel | undefined, status: string) {
    if (!channel || channel.readyState !== 'open') {
      return;
    }
    channel.send(JSON.stringify({ type: 'status', status }));
  }

  private forwardAudioToPeer(chunk: AudioDeltaPayload, source: InstanceType<typeof RTCAudioSource>) {
    const raw = Buffer.from(chunk.base64, 'base64');
    const pcm16 = new Int16Array(raw.buffer, raw.byteOffset, raw.length / 2);
    const upsampled = this.resampleInt16(
      pcm16,
      chunk.sampleRate,
      RealTimeService.WEBRTC_SAMPLE_RATE,
    );

    const buffer = Buffer.from(upsampled.buffer, upsampled.byteOffset, upsampled.byteLength);
    source.onData({
      samples: buffer,
      sampleRate: RealTimeService.WEBRTC_SAMPLE_RATE,
      bitsPerSample: 16,
      channelCount: 1,
      numberOfFrames: buffer.length / 2,
    });
  }

  private preparePcmChunk(frame: SinkFrame): Buffer {
    const mono = this.toMonoInt16(frame);
    const resampled = this.resampleInt16(
      mono,
      frame.sampleRate,
      RealTimeService.OPENAI_INPUT_SAMPLE_RATE,
    );
    return Buffer.from(resampled.buffer, resampled.byteOffset, resampled.byteLength);
  }

  private toMonoInt16(frame: SinkFrame): Int16Array {
    const totalSamples = frame.samples.length / 2;
    const view = new Int16Array(frame.samples.buffer, frame.samples.byteOffset, totalSamples);
    if (frame.channelCount <= 1) {
      return new Int16Array(view);
    }

    const frames = totalSamples / frame.channelCount;
    const mono = new Int16Array(frames);
    for (let i = 0; i < frames; i++) {
      let sum = 0;
      for (let ch = 0; ch < frame.channelCount; ch++) {
        sum += view[i * frame.channelCount + ch];
      }
      mono[i] = sum / frame.channelCount;
    }
    return mono;
  }

  private resampleInt16(samples: Int16Array, sourceRate: number, targetRate: number): Int16Array {
    if (sourceRate === targetRate) {
      return new Int16Array(samples);
    }
    const ratio = sourceRate / targetRate;
    const newLength = Math.floor(samples.length / ratio);
    const result = new Int16Array(newLength);
    let offsetResult = 0;
    let offsetSource = 0;

    while (offsetResult < newLength) {
      const nextOffsetSource = Math.round((offsetResult + 1) * ratio);
      let accum = 0;
      let count = 0;
      for (let i = offsetSource; i < nextOffsetSource && i < samples.length; i++) {
        accum += samples[i];
        count++;
      }
      result[offsetResult] = count ? accum / count : 0;
      offsetResult++;
      offsetSource = nextOffsetSource;
    }
    return result;
  }
}
